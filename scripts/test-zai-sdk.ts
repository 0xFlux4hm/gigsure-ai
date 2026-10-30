/**
 * Test the Z.AI SDK directly using the /etc/.z-ai-config file.
 * Verifies that the AI model itself works (independent of our route).
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";

async function main() {
  const configPath = "/etc/.z-ai-config";
  const configStr = fs.readFileSync(configPath, "utf-8");
  const config = JSON.parse(configStr);
  console.log("=== Config loaded from /etc/.z-ai-config ===");
  console.log("  baseUrl:", config.baseUrl);
  console.log("  apiKey:", config.apiKey);
  console.log("  chatId:", config.chatId);
  console.log("  userId:", config.userId);
  console.log("");

  const zai = new ZAI(config);
  console.log("=== Calling chat.completions.create ===");
  const completion = await zai.chat.completions.create({
    messages: [
      { role: "system", content: "You are a helpful assistant. Reply in one short sentence." },
      { role: "user", content: "Say hello and tell me what 2+2 equals." },
    ],
    temperature: 0.4,
    max_tokens: 100,
  });
  console.log("");
  console.log("=== Z.AI Response ===");
  console.log(completion.choices?.[0]?.message?.content ?? "(no content)");
  console.log("");
  console.log("=== Usage ===");
  console.log(JSON.stringify(completion.usage, null, 2));
  console.log("");
  console.log("=== Full raw response (first 500 chars) ===");
  console.log(JSON.stringify(completion).substring(0, 500));
}

main().catch((err) => {
  console.error("✗ Test failed:", err);
  process.exit(1);
});
