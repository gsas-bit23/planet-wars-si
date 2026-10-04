// Screenshots of a deployed site: BASE_URL=https://planet-wars-si.vercel.app node e2e/live-shots.mjs
import { chromium } from "playwright";
const base = process.env.BASE_URL || "https://planet-wars-si.vercel.app";
const dir = new URL("../screenshots/", import.meta.url).pathname;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
for (const [path, file, wait, h] of [
  ["/", "live-landing.png", 9000, 900],
  ["/planets/venus", "live-planet-detail.png", 8000, 1500],
  ["/burn", "live-burn.png", 6000, 900],
  ["/broadcasts", "live-broadcasts.png", 6000, 900],
]) {
  await page.setViewportSize({ width: 1440, height: h });
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(wait);
  await page.screenshot({ path: dir + file });
  console.log("saved", file);
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(base + "/faucet", { waitUntil: "networkidle", timeout: 90000 });
await page.getByRole("button", { name: /^connect$/i }).first().click();
const modal = page.getByRole("dialog");
await modal.waitFor({ timeout: 15000 });
await page.waitForTimeout(1500);
console.log("wallet modal options:", (await modal.innerText()).split("\n").filter(Boolean).slice(0, 14).join(" | "));
await page.screenshot({ path: dir + "live-wallet-modal.png" });
console.log("saved live-wallet-modal.png", errors.length ? "\nERRORS: " + errors.join("\n") : "");
await browser.close();
