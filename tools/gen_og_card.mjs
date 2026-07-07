// Render tools/og_card.html to public/og-card.png (1200x630 Open Graph card).
// Headless Chromium, high deviceScaleFactor for crisp text. Run: node tools/gen_og_card.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CHROMIUM = process.env.BB_CHROMIUM || "/opt/pw-browsers/chromium";
mkdirSync(resolve(root, "public"), { recursive: true });

const browser = await chromium.launch({ executablePath: CHROMIUM });
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 2, // 2x for crisp neon text on retina/large previews
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

await page.goto("file://" + resolve(root, "tools/og_card.html"), { waitUntil: "load" });
await page.waitForFunction(() => window.__cardReady === true, { timeout: 5000 });
await page.waitForTimeout(150); // let shadows/glows settle

const card = await page.$("#card");
await card.screenshot({ path: resolve(root, "public/og-card.png") });
await browser.close();

if (errors.length) { console.log("PAGE ERRORS:", errors.join(" | ")); process.exit(1); }
console.log("wrote public/og-card.png (1200x630 @2x)");
