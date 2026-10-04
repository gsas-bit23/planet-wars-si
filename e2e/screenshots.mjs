// Capture README screenshots: node e2e/screenshots.mjs  (BASE_URL defaults to http://localhost:3005)
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const base = process.env.BASE_URL || "http://localhost:3005";
const dir = new URL("../screenshots/", import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const shots = [
  ["/", "01-landing.png", 9000],
  ["/planets/saturn", "02-planet-detail.png", 8000],
  ["/marketplace", "03-marketplace.png", 5000],
  ["/broadcasts", "04-si-broadcasts.png", 5000],
  ["/burn", "05-burn-dashboard.png", 5000],
  ["/portfolio", "06-portfolio.png", 5000],
];
// Connect the local dev wallet once so wallet-aware pages render with data.
await page.goto(base + "/faucet", { waitUntil: "networkidle", timeout: 90000 });
const connect = page.getByRole("button", { name: /^connect$/i }).first();
if (await connect.count()) {
  await connect.click();
  const dev = page.getByText("Anvil Dev Wallet");
  if (await dev.count()) await dev.click();
  else await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
}
for (const [path, file, wait] of shots) {
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(wait);
  // The planet page is shot taller so the 3D view and the territory grid both fit.
  const tall = path.startsWith("/planets/");
  if (tall) {
    await page.setViewportSize({ width: 1440, height: 1500 });
    await page.waitForTimeout(2500);
  }
  await page.screenshot({ path: dir + file });
  if (tall) await page.setViewportSize({ width: 1440, height: 900 });
  console.log("saved", dir + file);
}
await browser.close();
