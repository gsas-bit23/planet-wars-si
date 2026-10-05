// UI check for the rewards pages against a local anvil deployment (dev mock wallet = anvil #1).
// Usage: BASE=http://localhost:3005 SHOTS_DIR=/tmp node e2e/rewards-ui.mjs
import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:3005";
const shots = process.env.SHOTS_DIR || "/tmp";
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
const step = async (name, fn) => {
  try { await fn(); console.log("OK  ", name); }
  catch (e) { console.log("FAIL", name, String(e).split("\n")[0]); await page.screenshot({ path: `${shots}/fail-${name.replace(/\W+/g, "-")}.png` }); process.exitCode = 1; }
};
await page.goto(base + "/claim", { waitUntil: "networkidle", timeout: 90000 });
await step("connect dev wallet", async () => {
  await page.getByRole("button", { name: /connect/i }).first().click();
  await page.getByText("Anvil Dev Wallet").click();
  await page.getByText(/0x70.{1,3}79C8/i).first().waitFor({ timeout: 20000 });
});
await step("rewards tab lists claimed epoch", async () => {
  await page.getByTestId("claims-table").waitFor({ timeout: 20000 });
  await page.getByTestId("claims-table").getByText("claimed").first().waitFor({ timeout: 20000 });
});
await step("airdrop tab: claim", async () => {
  await page.getByRole("tab", { name: /airdrop/i }).click();
  const btn = page.getByTestId("claim-airdrop");
  await btn.waitFor({ timeout: 20000 });
  if ((await btn.innerText()).includes("Claimed")) return;
  await btn.click();
  await page.locator("[data-sonner-toast]").filter({ hasText: /confirmed|airdrop/i }).first().waitFor({ timeout: 45000 });
  await page.getByRole("button", { name: "Claimed" }).waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${shots}/local-claim-airdrop.png` });
});
for (const [path, testid] of [["/leaderboard", "leaderboard-table"], ["/rewards", "lottery-entry"], ["/burn", "total-pooled"]]) {
  await step(`page ${path}`, async () => {
    await page.goto(base + path, { waitUntil: "networkidle" });
    const target = path === "/leaderboard"
      ? page.getByTestId("leaderboard-table").or(page.getByTestId("leaderboard-empty"))
      : page.getByTestId(testid);
    await target.first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${shots}/local${path.replace("/", "-")}.png`, fullPage: true });
  });
}
await step("faucet link visible on testnet/local", async () => {
  await page.locator("header").getByRole("link", { name: "Faucet" }).first().waitFor({ timeout: 5000, state: "attached" });
});
console.log(errors.length ? "page errors: " + errors.join(" | ") : "no page errors");
await browser.close();
