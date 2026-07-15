// Generates public/apple-touch-icon.png — the placeholder "Add to Home
// Screen" icon (PLAN-03 task 4). PLAN-10 replaces this with real hand-made
// art; until then this keeps the repo's "assets come from a committed
// generator, never a hand-pasted binary" convention (see npm run art).
//
// Renders a tiny HTML swatch — PALETTE.bgPink background (#ffd6e8) with a
// bold PALETTE.plum (#4a2c40) "22", mirroring the existing favicon.svg
// motif — via headless SYSTEM Chrome (playwright-core, channel: 'chrome',
// same technique as scripts/playtest-*.mjs) and screenshots it at 180x180,
// the standard apple-touch-icon size. No rounded corners baked in: iOS
// applies its own mask/gloss to a plain square.
//
// Usage: node scripts/gen-app-icon.mjs
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const SIZE = 180;
const BG = '#ffd6e8'; // PALETTE.bgPink (src/systems/constants.ts)
const FG = '#4a2c40'; // PALETTE.plum
const OUT_PATH = 'public/apple-touch-icon.png';

const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: ${SIZE}px;
        height: ${SIZE}px;
        overflow: hidden;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${BG};
      }
      span {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 92px;
        font-weight: 700;
        color: ${FG};
      }
    </style>
  </head>
  <body><span>22</span></body>
</html>`;

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: SIZE, height: SIZE },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'load' });
    const buffer = await page.screenshot({ type: 'png', omitBackground: false });
    await writeFile(OUT_PATH, buffer);
    console.log(`wrote ${OUT_PATH} (${SIZE}x${SIZE})`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
