/**
 * Security regression tests for audit log redaction.
 *
 * Covers the H17 fix: recordAuditEvent + logSecurityEvent automatically
 * redact sensitive keys (token, password, secret, hash, key, signature,
 * authorization, csrf, etc.) from metadata before persistence.
 */
import { describe, it, expect } from "vitest";
import { redactSensitive } from "@/lib/auth/audit";

describe("audit log redaction (H17)", () => {
  it("redacts top-level sensitive keys", () => {
    const input = {
      email: "user@example.com",
      password: "secret123",
      token: "abc.def.ghi",
      apiKey: "sk_test_123",
      userId: "cmv123",
    };
    const out = redactSensitive(input);
    expect(out.password).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
    expect(out.apiKey).toBe("[REDACTED]");
    expect(out.email).toBe("user@example.com"); // not redacted
    expect(out.userId).toBe("cmv123"); // not redacted
  });

  it("redacts nested sensitive keys", () => {
    const input = {
      user: {
        email: "user@example.com",
        password: "secret123",
        profile: {
          refreshToken: "rt_abc",
          name: "John",
        },
      },
    };
    const out = redactSensitive(input);
    expect(out.user.password).toBe("[REDACTED]");
    expect(out.user.profile.refreshToken).toBe("[REDACTED]");
    expect(out.user.email).toBe("user@example.com");
    expect(out.user.profile.name).toBe("John");
  });

  it("redacts keys inside arrays", () => {
    const input = {
      events: [
        { type: "login", sessionToken: "st_abc" },
        { type: "logout", sessionToken: "st_def" },
      ],
    };
    const out = redactSensitive(input);
    expect(out.events[0].sessionToken).toBe("[REDACTED]");
    expect(out.events[1].sessionToken).toBe("[REDACTED]");
    expect(out.events[0].type).toBe("login");
  });

  it("redacts case-insensitively", () => {
    const input = {
      Password: "secret1",
      API_KEY: "sk_123",
      clientSecret: "cs_abc",
      webhook_secret: "whsec_xyz",
    };
    const out = redactSensitive(input);
    expect(out.Password).toBe("[REDACTED]");
    expect(out.API_KEY).toBe("[REDACTED]");
    expect(out.clientSecret).toBe("[REDACTED]");
    expect(out.webhook_secret).toBe("[REDACTED]");
  });

  it("redacts both underscore and camelCase variants", () => {
    const input = {
      csrf_token: "csrf_abc",
      csrfToken: "csrf_def",
      session_token: "st_xyz",
      sessionToken: "st_123",
    };
    const out = redactSensitive(input);
    expect(out.csrf_token).toBe("[REDACTED]");
    expect(out.csrfToken).toBe("[REDACTED]");
    expect(out.session_token).toBe("[REDACTED]");
    expect(out.sessionToken).toBe("[REDACTED]");
  });

  it("does not mutate the input", () => {
    const input = { password: "secret" };
    redactSensitive(input);
    expect(input.password).toBe("secret");
  });

  it("handles null + non-object inputs", () => {
    expect(redactSensitive(null)).toBe(null);
    expect(redactSensitive("string")).toBe("string");
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(undefined)).toBe(undefined);
  });
});
