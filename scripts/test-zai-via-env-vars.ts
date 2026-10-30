/**
 * Test Z.AI SDK using the env vars (simulating Vercel serverless).
 *
 * This script verifies that:
 *   1. The ZAI_API_KEY + ZAI_BASE_URL + ZAI_TOKEN env vars are present
 *   2. The ZAI constructor accepts them
 *   3. The actual chat.completions.create() call succeeds
 *
 * Run with: bunx tsx --env-file=.env.local scripts/test-zai-via-env-vars.ts
 *
 * If this script SUCCEEDS, the AI integration works on Vercel — the issue
 * is something else (auth, route plumbing, etc.).
 * If this script FAILS, the env vars themselves are wrong/missing.
 */
import ZAI from "z-ai-web-dev-sdk";

async function main() {
  console.log("=== ENV VARS CHECK ===");
  const envVars = [
    "ZAI_API_KEY",
    "ZAI_BASE_URL",
    "ZAI_CHAT_ID",
    "ZAI_USER_ID",
    "ZAI_TOKEN",
  ];
  for (const v of envVars) {
    const val = process.env[v];
    if (!val) {
      console.log(`  ✗ ${v}: MISSING`);
    } else {
      // Show redacted value
      const display = v === "ZAI_API_KEY" || v === "ZAI_TOKEN"
        ? val.slice(0, 4) + "..." + val.slice(-4)
        : val.slice(0, 30) + (val.length > 30 ? "..." : "");
      console.log(`  ✓ ${v}: ${display} (length: ${val.length})`);
    }
  }

  const apiKey = process.env.ZAI_API_KEY;
  const baseUrl = process.env.ZAI_BASE_URL ?? "https://internal-api.z.ai/v1";
  if (!apiKey) {
    console.log("\n✗ ZAI_API_KEY is not set. Cannot continue.");
    process.exit(1);
  }

  console.log("\n=== CONSTRUCT ZAI INSTANCE ===");
  const config = {
    baseUrl,
    apiKey,
    chatId: process.env.ZAI_CHAT_ID,
    userId: process.env.ZAI_USER_ID,
    token: process.env.ZAI_TOKEN,
  };
  console.log("Config:", {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey.slice(0, 4) + "..." + config.apiKey.slice(-4),
    chatId: config.chatId,
    userId: config.userId,
    token: config.token ? config.token.slice(0, 10) + "..." + config.token.slice(-4) : "(not set)",
  });

  const zai = new (ZAI as unknown as { new (config: typeof config): typeof ZAI.prototype })(config);
  console.log("✓ ZAI instance constructed");

  console.log("\n=== CALL chat.completions.create ===");
  console.log("(Using glm-4.7-flash — the FREE model that works with zero balance)");
  try {
    const completion = await zai.chat.completions.create({
      model: "glm-4.7-flash",  // FREE model — works with zero balance
      messages: [
        { role: "system", content: "You are a helpful assistant. Reply in one short sentence." },
        { role: "user", content: "Say hello and tell me what 2+2 equals." },
      ],
      temperature: 0.4,
      max_tokens: 200,
      thinking: { type: "disabled" } as never,
    });
    console.log("✓ Z.AI response received!");
    console.log("");
    console.log("=== RESPONSE ===");
    console.log((completion as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ?? "(no content)");
    console.log("");
    console.log("=== USAGE ===");
    console.log(JSON.stringify((completion as { usage?: unknown }).usage, null, 2));
    console.log("");
    console.log("=== MODEL ===");
    console.log((completion as { model?: string }).model ?? "(unknown)");
    console.log("");
    console.log("✅ ALL GOOD — Z.AI works via env vars. The AI integration should work on Vercel.");
  } catch (err) {
    console.log("✗ Z.AI call FAILED");
    console.log("");
    console.log("=== ERROR DETAILS ===");
    console.log("  name:    ", (err as Error)?.name);
    console.log("  message: ", (err as Error)?.message);
    console.log("  status:  ", (err as { status?: number })?.status);
    console.log("  stack:");
    console.log((err as Error)?.stack?.split("\n").slice(0, 5).join("\n"));
    console.log("");
    console.log("=== FULL ERROR (first 500 chars) ===");
    console.log(JSON.stringify(err, null, 2).slice(0, 500));
  }
}

main().catch((err) => {
  console.error("✗ Script crashed:", err);
  process.exit(1);
});
