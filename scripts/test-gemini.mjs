// Smoke test: call Gemini via OpenAI SDK (the same code path the AI route uses)
// Run from a SUPPORTED region (Nigeria, US, EU, etc.) — Hong Kong sandbox will
// get a "User location is not supported" error.
//
// Usage:
//   GEMINI_API_KEY=<key> node scripts/test-gemini.mjs
//
import OpenAI from "openai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ GEMINI_API_KEY env var not set");
  console.error("   Get one at https://aistudio.google.com/apikey");
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});

console.log("Testing Gemini via OpenAI SDK (gemini-3.8-flash)...");
const t0 = Date.now();
try {
  const completion = await client.chat.completions.create({
    model: "gemini-3.8-flash",
    messages: [
      { role: "system", content: "You are a helpful assistant. Reply in one short sentence." },
      { role: "user", content: "Say hi and tell me what model you are." },
    ],
    temperature: 0.4,
    max_tokens: 100,
  });
  const dt = Date.now() - t0;
  console.log(`✓ Success in ${dt}ms`);
  console.log("  Response:", completion.choices[0]?.message?.content);
  console.log("  Tokens used:", completion.usage?.total_tokens ?? "n/a");
} catch (err) {
  const dt = Date.now() - t0;
  console.error(`❌ Failed in ${dt}ms`);
  console.error("  Status:", err.status);
  console.error("  Message:", err.message);
  if (err.error) console.error("  Body:", JSON.stringify(err.error, null, 2).slice(0, 500));
}
