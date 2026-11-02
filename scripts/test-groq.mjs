// Smoke test: call Groq via OpenAI SDK (the same code path the AI routes use)
// Run from a SUPPORTED region (Nigeria, US, EU, etc.) — Hong Kong sandbox gets
// 403 Forbidden because Groq geo-blocks HK at the Cloudflare edge.
//
// Usage:
//   GROQ_API_KEY=<key> node scripts/test-groq.mjs
//
// Or if .env.local is loaded automatically by your shell:
//   node scripts/test-groq.mjs
//
import OpenAI from "openai";
import { readFileSync } from "fs";

// Load .env.local manually (Node doesn't auto-load it)
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* .env.local not found — use process.env directly */ }

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
  console.error("❌ GROQ_API_KEY env var not set");
  console.error("   Get one at https://console.groq.com/keys");
  console.error("   Or set it in .env.local: GROQ_API_KEY=gsk_...");
  process.exit(1);
}

const client = new OpenAI({
  apiKey,
  baseURL: "https://api.groq.com/openai/v1",
});

console.log("Testing Groq via OpenAI SDK...");
console.log(`  Base URL: ${client.baseURL}`);
console.log(`  Model: openai/gpt-oss-20b (user-specified initial model)`);
console.log("");

// Test 1: openai/gpt-oss-20b (the user's specified initial model)
console.log("=== Test 1: openai/gpt-oss-20b ===");
const t0 = Date.now();
try {
  const completion = await client.chat.completions.create({
    model: "openai/gpt-oss-20b",
    messages: [
      { role: "system", content: "You are a helpful assistant. Reply in one short sentence." },
      { role: "user", content: "Say hi and tell me what model you are." },
    ],
    temperature: 0.4,
    max_tokens: 100,
  });
  const dt = Date.now() - t0;
  console.log(`✓ Success in ${dt}ms (that's ~${Math.round(100/dt*1000)} tokens/sec)`);
  console.log("  Response:", completion.choices[0]?.message?.content);
  console.log("  Tokens used:", completion.usage?.total_tokens ?? "n/a");
} catch (err) {
  const dt = Date.now() - t0;
  console.error(`❌ Failed in ${dt}ms`);
  console.error("  Status:", err.status);
  console.error("  Message:", err.message);
  if (err.error) console.error("  Body:", JSON.stringify(err.error, null, 2).slice(0, 500));
  if (err.status === 403) {
    console.error("");
    console.error("  403 Forbidden usually means:");
    console.error("    1. Region block — Groq geo-blocks HK/China/Iran/etc at Cloudflare edge.");
    console.error("       Check cf-ray header in the error — if it ends in -HKG, you're blocked.");
    console.error("       Nigeria, US, EU are all supported.");
    console.error("    2. Model not enabled — openai/gpt-oss-20b may need to be enabled in your");
    console.error("       Groq dashboard → Settings → Model Permissions.");
    console.error("       Try a different model: llama-3.3-70b-versatile is on the free tier.");
  }
}

console.log("");

// Test 2: llama-3.3-70b-versatile (fallback if gpt-oss-20b needs enablement)
console.log("=== Test 2: llama-3.3-70b-versatile (fallback model) ===");
const t1 = Date.now();
try {
  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{ role: "user", content: "Reply with PONG only." }],
    max_tokens: 10,
  });
  const dt = Date.now() - t1;
  console.log(`✓ Success in ${dt}ms`);
  console.log("  Response:", completion.choices[0]?.message?.content);
} catch (err) {
  console.error(`❌ Failed: ${err.status} ${err.message}`);
}

console.log("");

// Test 3: List available models
console.log("=== Test 3: List available models ===");
try {
  const models = await client.models.list();
  console.log(`✓ Found ${models.data.length} models:`);
  // Show first 10 — focus on chat-capable ones
  const chatModels = models.data.filter(m =>
    m.id.includes("gpt-oss") || m.id.includes("llama") || m.id.includes("qwen")
  );
  for (const m of chatModels.slice(0, 10)) {
    console.log(`  - ${m.id}  (ctx: ${m.context_window ?? "?"} tok)`);
  }
} catch (err) {
  console.error(`❌ Failed: ${err.status} ${err.message}`);
}
