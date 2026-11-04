#!/usr/bin/env node
/**
 * render-assets.js — render diagram HTML → PNG (for embedding in ReportLab)
 *                    and cover HTML → PDF (for body merge).
 *
 * Usage:
 *   node render-assets.js                # renders all three assets
 *   node render-assets.js cover          # only cover PDF
 *   node render-assets.js arch           # only architecture PNG
 *   node render-assets.js pay            # only payment flow PNG
 *
 * Output paths (matching the brief):
 *   /home/z/my-project/scripts/cover.pdf
 *   /home/z/my-project/scripts/architecture-diagram.png
 *   /home/z/my-project/scripts/payment-flow-diagram.png
 */
const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = '/home/z/my-project/scripts';

const ASSETS = {
  cover: {
    html: path.join(SCRIPT_DIR, 'cover.html'),
    out:  path.join(SCRIPT_DIR, 'cover.pdf'),
    width:  794,   // A4 @ 96dpi
    height: 1123,
    format: 'pdf',
  },
  arch: {
    html: path.join(SCRIPT_DIR, 'architecture-diagram.html'),
    out:  path.join(SCRIPT_DIR, 'architecture-diagram.png'),
    width: 1200,
    height: 760,
    format: 'png',
  },
  pay: {
    html: path.join(SCRIPT_DIR, 'payment-flow-diagram.html'),
    out:  path.join(SCRIPT_DIR, 'payment-flow-diagram.png'),
    width: 1200,
    height: 760,
    format: 'png',
  },
};

function resolveChromium() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    '/home/z/.cache/ms-playwright/chromium-1200/chrome-linux64/chrome',
    '/usr/bin/chromium-browser', '/usr/bin/chromium', '/usr/bin/google-chrome',
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

async function main() {
  const targets = process.argv.slice(2);
  const keys = targets.length === 0 ? Object.keys(ASSETS) : targets;
  let playwright;
  try { playwright = require('playwright'); }
  catch { try { playwright = require('playwright-core'); } catch { console.error('playwright not installed'); process.exit(1); } }

  const exe = resolveChromium();
  if (!exe) { console.error('Chromium not found'); process.exit(1); }

  const browser = await playwright.chromium.launch({ headless: true, executablePath: exe });

  try {
    for (const key of keys) {
      const a = ASSETS[key];
      if (!a) { console.error('Unknown asset:', key); continue; }
      if (!fs.existsSync(a.html)) { console.error('HTML missing:', a.html); continue; }

      const page = await browser.newPage({ viewport: { width: a.width, height: a.height } });
      await page.goto('file://' + path.resolve(a.html), { waitUntil: 'networkidle' });
      // small delay for fonts/layout
      await page.waitForTimeout(200);

      if (a.format === 'pdf') {
        // Use millimeter dimensions matching ReportLab's A4 exactly.
        // A4 = 210mm × 297mm = 595.276pt × 841.890pt.
        await page.pdf({
          path: a.out,
          width:  '210mm',
          height: '297mm',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
          preferCSSPageSize: false,
        });
      } else {
        await page.screenshot({ path: a.out, fullPage: false, omitBackground: false, clip: { x: 0, y: 0, width: a.width, height: a.height } });
      }

      const size = (fs.statSync(a.out).size / 1024).toFixed(1);
      console.log(`✓ ${key} → ${a.out} (${size} KB)`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
