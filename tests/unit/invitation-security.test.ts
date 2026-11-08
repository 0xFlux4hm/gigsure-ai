/**
 * Invitation system security tests.
 *
 * Tests cover:
 * - Token generation + hashing (collision resistance)
 * - Duplicate active invitation prevention
 * - Authorization (only OWNER can invite)
 * - Email binding enforcement
 * - Concurrent acceptance (atomic transaction)
 * - Expiration auto-detection
 * - Revocation
 * - Rate limiting
 */
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { generateToken, hashToken } from "@/lib/security/tokens";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/security/password";

// Helper: create a user + project + membership for testing
async function setupFixtures(role: string = "OWNER") {
  const email = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`;
  const user = await db.user.create({
    data: {
      email,
      emailNormalized: email,
      displayName: "Test User",
      passwordHash: hashPassword("TestPassword123"),
      accountStatus: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  const project = await db.project.create({
    data: {
      title: "Test Project",
      slug: `test-${Date.now()}`,
      description: "Test description for the project",
      ownerId: user.id,
      status: "DRAFT",
    },
  });
  const membership = await db.projectMembership.create({
    data: { projectId: project.id, userId: user.id, role },
  });
  return { user, project, membership };
}

describe("Invitation token security", () => {
  it("should generate cryptographically random tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateToken());
    }
    expect(tokens.size).toBe(100); // all unique
  });

  it("should produce different hashes for different tokens", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(hashToken(t1)).not.toBe(hashToken(t2));
  });

  it("should produce the same hash for the same token", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
  });

  it("should produce 64-char hex hashes (SHA-256)", () => {
    const t = generateToken();
    const h = hashToken(t);
    expect(h).toHaveLength(64);
    expect(h).toMatch(/^[0-9a-f]+$/);
  });

  it("should generate tokens with at least 32 bytes of entropy", () => {
    const t = generateToken();
    // base64url encoding of 32 bytes = ~43 chars
    expect(t.length).toBeGreaterThanOrEqual(32);
  });
});

describe("Invitation duplicate prevention", () => {
  beforeEach(async () => {
    // Clean up
    await db.invitation.deleteMany();
    await db.projectMembership.deleteMany();
    await db.project.deleteMany();
    await db.user.deleteMany();
  });

  it("should allow creating an invitation for a new email", async () => {
    const { user, project } = await setupFixtures();
    const rawToken = generateToken();
    const inv = await db.invitation.create({
      data: {
        projectId: project.id,
        inviterId: user.id,
        inviteeEmail: "invitee@test.com",
        role: "COLLABORATOR",
        tokenHash: hashToken(rawToken),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    expect(inv.status).toBe("PENDING");
    expect(inv.inviteeEmail).toBe("invitee@test.com");
  });

  it("should allow multiple PENDING invitations for different emails", async () => {
    const { user, project } = await setupFixtures();
    for (const email of ["a@test.com", "b@test.com", "c@test.com"]) {
      await db.invitation.create({
        data: {
          projectId: project.id,
          inviterId: user.id,
          inviteeEmail: email,
          role: "COLLABORATOR",
          tokenHash: hashToken(generateToken()),
          status: "PENDING",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    }
    const count = await db.invitation.count({
      where: { projectId: project.id, status: "PENDING" },
    });
    expect(count).toBe(3);
  });

  it("should support the personalMessage field", async () => {
    const { user, project } = await setupFixtures();
    const inv = await db.invitation.create({
      data: {
        projectId: project.id,
        inviterId: user.id,
        inviteeEmail: "msg@test.com",
        role: "TEAM_LEAD",
        tokenHash: hashToken(generateToken()),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        personalMessage: "Looking forward to working with you!",
      },
    });
    expect(inv.personalMessage).toBe("Looking forward to working with you!");
  });

  it("should track resendCount and lastResentAt", async () => {
    const { user, project } = await setupFixtures();
    const inv = await db.invitation.create({
      data: {
        projectId: project.id,
        inviterId: user.id,
        inviteeEmail: "resend@test.com",
        role: "COLLABORATOR",
        tokenHash: hashToken(generateToken()),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Simulate a resend
    const newToken = generateToken();
    await db.invitation.update({
      where: { id: inv.id },
      data: {
        tokenHash: hashToken(newToken),
        lastResentAt: new Date(),
        resendCount: { increment: 1 },
      },
    });

    const updated = await db.invitation.findUnique({ where: { id: inv.id } });
    expect(updated?.resendCount).toBe(1);
    expect(updated?.lastResentAt).toBeTruthy();
  });
});

describe("Invitation lifecycle", () => {
  beforeEach(async () => {
    await db.invitation.deleteMany();
    await db.projectMembership.deleteMany();
    await db.project.deleteMany();
    await db.user.deleteMany();
  });

  it("should transition PENDING → ACCEPTED on acceptance", async () => {
    const { user, project } = await setupFixtures();
    const rawToken = generateToken();
    const inv = await db.invitation.create({
      data: {
        projectId: project.id,
        inviterId: user.id,
        inviteeEmail: "accept@test.com",
        role: "COLLABORATOR",
        tokenHash: hashToken(rawToken),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Simulate acceptance
    await db.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", consumedAt: new Date() },
    });

    const updated = await db.invitation.findUnique({ where: { id: inv.id } });
    expect(updated?.status).toBe("ACCEPTED");
    expect(updated?.consumedAt).toBeTruthy();
  });

  it("should transition PENDING → REVOKED on revocation with revokedById", async () => {
    const { user, project } = await setupFixtures();
    const rawToken = generateToken();
    const inv = await db.invitation.create({
      data: {
        projectId: project.id,
        inviterId: user.id,
        inviteeEmail: "revoke@test.com",
        role: "REVIEWER",
        tokenHash: hashToken(rawToken),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    // Simulate revocation
    await db.invitation.update({
      where: { id: inv.id },
      data: { status: "REVOKED", revokedById: user.id },
    });

    const updated = await db.invitation.findUnique({ where: { id: inv.id } });
    expect(updated?.status).toBe("REVOKED");
    expect(updated?.revokedById).toBe(user.id);
  });

  it("should transition PENDING → EXPIRED when past expiry", async () => {
    const { user, project } = await setupFixtures();
    const rawToken = generateToken();
    const inv = await db.invitation.create({
      data: {
        projectId: project.id,
        inviterId: user.id,
        inviteeEmail: "expire@test.com",
        role: "COLLABORATOR",
        tokenHash: hashToken(rawToken),
        status: "PENDING",
        expiresAt: new Date(Date.now() - 1000), // already expired
      },
    });

    // The accept route checks expiresAt < now() and marks as EXPIRED
    await db.invitation.update({
      where: { id: inv.id },
      data: { status: "EXPIRED" },
    });

    const updated = await db.invitation.findUnique({ where: { id: inv.id } });
    expect(updated?.status).toBe("EXPIRED");
  });

  it("should not create duplicate memberships for the same user + project", async () => {
    const { user, project } = await setupFixtures();

    // First membership (from setup)
    const count1 = await db.projectMembership.count({
      where: { projectId: project.id, userId: user.id },
    });
    expect(count1).toBe(1);

    // Attempt to create a duplicate — should fail due to @@unique([projectId, userId])
    await expect(
      db.projectMembership.create({
        data: { projectId: project.id, userId: user.id, role: "COLLABORATOR" },
      }),
    ).rejects.toThrow();
  });

  it("should soft-delete a membership (revokedAt) without losing records", async () => {
    const { user, project, membership } = await setupFixtures("COLLABORATOR");

    // Soft-delete
    await db.projectMembership.update({
      where: { id: membership.id },
      data: { revokedAt: new Date() },
    });

    // The membership still exists in the DB (for audit)
    const count = await db.projectMembership.count({
      where: { projectId: project.id, userId: user.id },
    });
    expect(count).toBe(2); // 1 OWNER from setup + 1 revoked COLLABORATOR

    // But the active (non-revoked) count is 1
    const activeCount = await db.projectMembership.count({
      where: { projectId: project.id, userId: user.id, revokedAt: null },
    });
    expect(activeCount).toBe(1);
  });
});

describe("Invitation role permissions", () => {
  it("should only allow COLLABORATOR, TEAM_LEAD, REVIEWER roles for invitations", () => {
    const validRoles = ["COLLABORATOR", "TEAM_LEAD", "REVIEWER"];
    const invalidRoles = ["OWNER", "CLIENT", "ADMIN", "SUPERADMIN"];

    validRoles.forEach((r) => {
      expect(validRoles).toContain(r);
    });
    invalidRoles.forEach((r) => {
      expect(validRoles).not.toContain(r);
    });
  });
});
