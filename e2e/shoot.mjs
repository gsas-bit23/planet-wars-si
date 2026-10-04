// Quick visual pass: node e2e/shoot.mjs <path> <out.png> [width] [height] [waitMs] [fullPage]
import { chromium } from "playwright";
const [, , path = "/", out = "/tmp/shot.png", w = "1440", h = "900", wait = "4000", full = "0"] = process.argv;
const base = process.env.BASE_URL || "http://localhost:3005";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(+wait);
if (full === "1") {
  // Scroll through so in-view reveal animations fire, then return to top.
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
}
await page.screenshot({ path: out, fullPage: full === "1" });
console.log("saved", out, errors.length ? "\nERRORS:\n" + errors.slice(0, 10).join("\n") : "");
await browser.close();
