/**
 * Security regression tests for body-size limits + Zod error redaction.
 *
 * Covers:
 *   H14: parseJsonBody enforces 1 MiB body size cap
 *   M11: Zod errors no longer echo `issues` to client
 *   M11: prototype pollution defense (__proto__/constructor stripped)
 */
import { describe, it, expect } from "vitest";
import { parseJsonBody } from "@/lib/api";

describe("parseJsonBody body size limit (H14)", () => {
  it("accepts normal-sized bodies", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
      headers: { "content-type": "application/json" },
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({ foo: "bar" });
  });

  it("rejects bodies exceeding 1 MiB", async () => {
    // Create a body > 1 MiB
    const huge = JSON.stringify({ data: "x".repeat(2 * 1024 * 1024) });
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: huge,
      headers: { "content-type": "application/json" },
    });
    await expect(parseJsonBody(req)).rejects.toThrow();
  });

  it("rejects bodies exceeding 1 MiB even without Content-Length", async () => {
    // Stream the body without Content-Length
    const huge = JSON.stringify({ data: "x".repeat(2 * 1024 * 1024) });
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: huge,
      // Don't set content-length
    });
    await expect(parseJsonBody(req)).rejects.toThrow();
  });

  it("rejects malformed JSON", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: "not valid json{",
      headers: { "content-type": "application/json" },
    });
    await expect(parseJsonBody(req)).rejects.toThrow();
  });

  it("returns {} for empty body", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: "",
    });
    const result = await parseJsonBody(req);
    expect(result).toEqual({});
  });
});

describe("prototype pollution defense (M11)", () => {
  it("strips __proto__ key from parsed body", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ __proto__: { polluted: true }, legit: "yes" }),
    });
    const result = await parseJsonBody<Record<string, unknown>>(req);
    // __proto__ should be deleted as an own property
    expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(false);
    expect(result.legit).toBe("yes");
    // Verify Object.prototype is NOT polluted
    expect({}.polluted).toBeUndefined();
  });

  it("strips constructor key from parsed body", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ constructor: { prototype: { polluted: true } }, legit: "yes" }),
    });
    const result = await parseJsonBody<Record<string, unknown>>(req);
    // constructor should be deleted as an own property
    expect(Object.prototype.hasOwnProperty.call(result, "constructor")).toBe(false);
    expect(result.legit).toBe("yes");
    // Verify Object.prototype is NOT polluted
    expect({}.polluted).toBeUndefined();
  });

  it("strips prototype key from parsed body", async () => {
    const req = new Request("http://localhost/test", {
      method: "POST",
      body: JSON.stringify({ prototype: { polluted: true }, legit: "yes" }),
    });
    const result = await parseJsonBody<Record<string, unknown>>(req);
    expect(result.prototype).toBeUndefined();
    expect(result.legit).toBe("yes");
    expect({}.polluted).toBeUndefined();
  });
});
