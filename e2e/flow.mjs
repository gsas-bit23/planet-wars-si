// End-to-end smoke test against a local anvil deployment using the dev mock wallet.
// Usage: BASE_URL=http://localhost:3005 node e2e/flow.mjs
import { chromium } from "playwright";
const base = process.env.BASE_URL || "http://localhost:3005";
const shots = process.env.SHOTS_DIR || "/tmp";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", String(e).slice(0, 300)));
const step = async (name, fn) => {
  try { await fn(); console.log("OK  ", name); }
  catch (e) { console.log("FAIL", name, String(e).split("\n")[0]); await page.screenshot({ path: `${shots}/fail-${name.replace(/\W+/g, "-")}.png` }); }
};
const toast = async (re, timeout = 45000) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout });

await page.goto(base + "/faucet", { waitUntil: "networkidle", timeout: 90000 });
await step("connect dev wallet", async () => {
  await page.getByRole("button", { name: /connect/i }).first().click();
  await page.getByText("Anvil Dev Wallet").click();
  await page.getByText(/0x70.{1,3}79C8/i).first().waitFor({ timeout: 20000 });
});
await step("faucet claim", async () => {
  const btn = page.getByRole("button", { name: /Claim test PWSI|Next claim in/ });
  await btn.waitFor({ timeout: 20000 });
  if (/Next claim/.test(await btn.innerText())) { console.log("     (cooldown active - per-wallet rate limit enforced)"); return; }
  await btn.click();
  await toast(/confirmed|claimed|success/i);
  await page.getByRole("button", { name: /Next claim in/ }).waitFor({ timeout: 20000 });
});
await step("claim 3 plots on Mercury", async () => {
  await page.goto(base + "/planets/mercury", { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  const canvas = page.locator("canvas").last();
  const box = await canvas.boundingBox();
  const cell = box.width / 30;
  // Random open-ish row so reruns pick fresh plots.
  const row = 14 + Math.floor(Math.random() * 6);
  const col0 = Math.floor(Math.random() * 25);
  for (const c of [col0, col0 + 1, col0 + 2]) await canvas.click({ position: { x: cell * c + cell / 2, y: cell * row + cell / 2 } });
  await page.getByTestId("claim-list").waitFor({ timeout: 5000 });
  await page.getByTestId("claim-button").click();
  await toast(/claimed|confirmed/i, 60000);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${shots}/flow-claimed.png` });
});
await step("upgrade in portfolio", async () => {
  await page.goto(base + "/portfolio", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /upgrade to level/i }).first().click({ timeout: 20000 });
  await toast(/upgrade|confirmed/i, 60000);
  await page.screenshot({ path: `${shots}/flow-portfolio.png` });
});
await step("buy listing", async () => {
  await page.goto(base + "/marketplace", { waitUntil: "networkidle" });
  await page.getByTestId("buy-button").and(page.locator(":enabled")).first().click({ timeout: 20000 });
  await page.getByTestId("confirm-buy").click();
  await toast(/bought|purchase|confirmed/i, 60000);
});
await step("list a territory", async () => {
  await page.getByRole("tab", { name: "Sell" }).click();
  await page.getByTestId("list-button").first().click({ timeout: 20000 });
  await page.getByRole("dialog").locator("input").fill("333");
  await page.getByTestId("confirm-list").click();
  await toast(/listed|confirmed/i, 60000);
});
await step("defend attack", async () => {
  await page.goto(base + "/broadcasts", { waitUntil: "networkidle" });
  await page.getByTestId("defend-button").first().click({ timeout: 20000 });
  const commit = page.getByTestId("commit-defense").first();
  if (await commit.count() === 0) throw new Error("no eligible territory on attacked planet");
  await commit.click();
  await toast(/defen|commit/i, 30000);
});
await browser.close();
