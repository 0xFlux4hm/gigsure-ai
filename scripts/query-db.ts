import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

async function main() {
  // 1. Table row counts
  const tables = ["User", "Project", "ProjectMembership", "Invitation", "Task", "Milestone", "ContractVersion", "Dispute", "Notification", "AiActivity", "AuditEvent", "FundingRecord", "Payout"];
  console.log("=== TABLE ROW COUNTS ===");
  for (const t of tables) {
    try {
      // @ts-expect-error — dynamic model name
      const count = await prisma[t].count();
      console.log(`  ${t}: ${count}`);
    } catch (e) {
      console.log(`  ${t}: (error or table not found)`);
    }
  }

  // 2. Invitation schema — verify new columns exist
  console.log("\n=== INVITATION COLUMNS ===");
  const cols = await prisma.$queryRaw`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'Invitation'
    ORDER BY ordinal_position;
  `;
  console.log(JSON.stringify(cols, null, 2));

  // 3. Recent users
  console.log("\n=== RECENT USERS (last 5) ===");
  const users = await prisma.user.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, displayName: true, platformRole: true, accountStatus: true, emailVerifiedAt: true, createdAt: true },
  });
  console.log(JSON.stringify(users, null, 2));

  // 4. Recent projects
  console.log("\n=== RECENT PROJECTS (last 5) ===");
  const projects = await prisma.project.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, status: true, currency: true, fundingArrangement: true, createdAt: true, owner: { select: { displayName: true, email: true } } },
  });
  console.log(JSON.stringify(projects, null, 2));

  // 5. Recent invitations
  console.log("\n=== RECENT INVITATIONS (last 5) ===");
  const invitations = await prisma.invitation.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, role: true, inviteeEmail: true, expiresAt: true, createdAt: true, resendCount: true, lastResentAt: true, personalMessage: true, inviter: { select: { displayName: true } }, project: { select: { title: true } } },
  });
  console.log(JSON.stringify(invitations, null, 2));

  // 6. Recent audit events
  console.log("\n=== RECENT AUDIT EVENTS (last 10) ===");
  const audit = await prisma.auditEvent.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    select: { id: true, action: true, targetType: true, createdAt: true, actor: { select: { displayName: true, email: true } } },
  });
  console.log(JSON.stringify(audit, null, 2));

  // 7. Notifications by type
  console.log("\n=== NOTIFICATIONS BY TYPE ===");
  const notifTypes = await prisma.$queryRaw`
    SELECT type, COUNT(*) as count
    FROM "Notification"
    GROUP BY type
    ORDER BY count DESC;
  `;
  console.log(JSON.stringify(notifTypes, null, 2));

  await prisma.$disconnect();
}

main().catch(console.error);
