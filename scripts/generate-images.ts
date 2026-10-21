/**
 * Generate the GigSure AI logo + landing page images.
 * Saves to /home/z/my-project/public/images/
 */
import ZAI from "z-ai-web-dev-sdk";
import fs from "fs";
import path from "path";

const OUT = "/home/z/my-project/public/images";
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

type Job = {
  name: string;
  prompt: string;
  size: "1024x1024" | "1440x720" | "1344x768" | "1152x864";
};

const jobs: Job[] = [
  // Logo — clean, modern, mark + wordmark style on transparent-friendly solid bg
  {
    name: "logo.png",
    prompt:
      "Minimalist modern logo for a Nigerian fintech-style SaaS product called 'GigSure AI'. A geometric shield emblem formed from interlocking chevrons and an upward-pointing check mark, suggesting trust, payments, and growth. Solid deep forest-green (#0F5132) primary with a single emerald accent (#10B981) on the check mark. Flat vector style, crisp edges, centered on pure white background, ample padding, professional, no text, no shadow. Looks great at 64px and 512px.",
    size: "1024x1024",
  },
  // Logo dark variant — same mark, on dark background
  {
    name: "logo-dark.png",
    prompt:
      "Same minimalist geometric shield logo with interlocking chevrons and an emerald check mark, but rendered in white and emerald green (#10B981) on a deep charcoal (#0F172A) background. Flat vector style, centered, ample padding, no text. Modern fintech SaaS brand.",
    size: "1024x1024",
  },
  // Favicon-style icon (square, just the mark)
  {
    name: "icon.png",
    prompt:
      "App icon, rounded-square format, minimalist geometric shield emblem with interlocking chevrons and an emerald check mark, deep forest-green background (#0F5132) with white and emerald accent (#10B981) mark centered. Modern fintech app icon, flat vector, no text, looks great at 32px and 512px.",
    size: "1024x1024",
  },
  // Hero illustration — freelancers collaborating in a Nigerian context
  {
    name: "hero.png",
    prompt:
      "Modern flat editorial illustration, wide landscape composition, depicting a Nigerian freelance team collaborating on a digital project. A designer with laptop, a developer pointing at a screen, and a client reviewing a contract — abstract, friendly, professional. Color palette: deep forest green, emerald, warm cream background, subtle warm orange accent. Clean geometric shapes, no photorealism, no text, no logos. Suitable for a SaaS landing page hero section. Negative space on the right for text overlay.",
    size: "1344x768",
  },
  // Feature illustration: contracts & trust
  {
    name: "feature-contracts.png",
    prompt:
      "Modern minimalist flat illustration of a stack of contracts and a green check mark seal of approval, with abstract milestone timeline dots connecting them. Color palette: deep forest green, emerald, cream background. Clean vector style, no text, professional, suitable as a feature icon illustration in a SaaS product card.",
    size: "1024x1024",
  },
  // Feature illustration: teams / collaboration
  {
    name: "feature-team.png",
    prompt:
      "Modern minimalist flat illustration of three abstract people avatars connected by lines forming a triangle, symbolizing team collaboration. Color palette: deep forest green, emerald, cream background. Clean vector style, no text, professional, suitable as a feature icon in a SaaS product card.",
    size: "1024x1024",
  },
  // Feature illustration: milestone funding
  {
    name: "feature-funding.png",
    prompt:
      "Modern minimalist flat illustration of a milestone payment flow — three vertical bars of increasing height with upward arrow, plus a small naira (₦) symbol floating above the tallest bar, suggesting milestone-based funding. Color palette: deep forest green, emerald, cream background. Clean vector style, professional, no text other than the symbol.",
    size: "1024x1024",
  },
  // Feature illustration: disputes
  {
    name: "feature-disputes.png",
    prompt:
      "Modern minimalist flat illustration of a balanced scale icon with a check mark on one side and a document icon on the other, symbolizing fair dispute resolution. Color palette: deep forest green, emerald, cream background. Clean vector style, professional, no text.",
    size: "1024x1024",
  },
  // Feature illustration: AI assistants
  {
    name: "feature-ai.png",
    prompt:
      "Modern minimalist flat illustration of an abstract AI brain / neural network icon with subtle sparkle accents, suggesting AI assistance. Color palette: deep forest green, emerald, cream background. Clean vector style, professional, no text.",
    size: "1024x1024",
  },
  // Feature illustration: privacy & trust
  {
    name: "feature-privacy.png",
    prompt:
      "Modern minimalist flat illustration of a shield with a padlock icon, suggesting privacy and data protection. Color palette: deep forest green, emerald, cream background. Clean vector style, professional, no text.",
    size: "1024x1024",
  },
  // OG / social share image
  {
    name: "og-image.png",
    prompt:
      "Modern social-share banner image for a Nigerian fintech SaaS brand. Centered minimalist geometric shield logo in deep forest green with emerald check mark on cream background, with subtle abstract milestone and contract icons arranged in a wide composition. Clean, professional, no text. Aspect ratio 1.91:1.",
    size: "1344x768",
  },
];

async function run() {
  console.log(`Generating ${jobs.length} images for GigSure AI (sequential, 5s between calls)…`);
  const zai = await ZAI.create();

  let completed = 0;
  let failed = 0;
  const failures: { name: string; error: string }[] = [];

  for (const job of jobs) {
    const outPath = path.join(OUT, job.name);
    // Skip if already generated (idempotent re-run)
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 5_000) {
      console.log(`✓ ${job.name} already exists, skipping`);
      completed++;
      continue;
    }
    try {
      console.log(`generating ${job.name}…`);
      const res = await zai.images.generations.create({
        prompt: job.prompt,
        size: job.size,
      });
      const base64 = res.data[0]?.base64;
      if (!base64) throw new Error("no base64 in response");
      const buf = Buffer.from(base64, "base64");
      fs.writeFileSync(outPath, buf);
      completed++;
      console.log(`✓ ${job.name} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      failed++;
      const msg = (err as Error).message;
      failures.push({ name: job.name, error: msg });
      console.error(`✗ ${job.name}:`, msg);
    }
    // Wait 5s between calls to avoid rate limit (429)
    await new Promise((r) => setTimeout(r, 5000));
  }

  console.log(`\nDone. ${completed} succeeded, ${failed} failed.`);
  if (failures.length > 0) {
    console.log("\nFailures:");
    failures.forEach((f) => console.log(`  - ${f.name}: ${f.error.slice(0, 100)}`));
    console.log("\nRe-run the script to retry failed/missing images.");
  }
  console.log(`Output: ${OUT}`);
}

run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
