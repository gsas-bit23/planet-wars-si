import { chromium } from "playwright";
const base = process.env.BASE || "https://www.pwsi.site";
const shots = process.env.SHOTS;
const paths = "/,/planets,/planets/earth,/marketplace,/leaderboard,/rewards,/claim,/broadcasts,/burn,/portfolio".split(",");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
const p = await ctx.newPage();
const errs = []; p.on("console", m => { if (m.type() === "error") errs.push(`[${p.url()}] ${m.text().slice(0, 160)}`); }); p.on("pageerror", e => errs.push(`[${p.url()}] PAGEERROR ${e.message.slice(0, 160)}`));
for (const path of paths) {
  const r = await p.goto(base + path, { waitUntil: "networkidle", timeout: 120000 }).catch(() => null);
  await p.waitForTimeout(3000);
  const low = (await p.locator("body").innerText()).replace(/\s+/g, " ").toLowerCase();
  const gates = ["launching soon", "opens at launch", "zones revealed at launch", "testnet", "faucet", "not deployed"].filter(w => low.includes(w));
  console.log(r?.status(), path, gates.length ? "FOUND: " + gates.join("|") : "no gates/traces");
  if (shots) await p.screenshot({ path: `${shots}/live-launched-${path === "/" ? "home" : path.slice(1).replace(/\//g, "-")}.png` });
}
// CA pill + copy
await p.goto(base + "/", { waitUntil: "networkidle" }); await p.waitForTimeout(2500);
const pill = p.locator('[data-testid="token-ca"]').first();
console.log("CA pills:", await p.locator('[data-testid="token-ca"]').count(), "| hero text:", (await pill.innerText()).replace(/\s+/g, " "));
await pill.locator('[data-testid="copy-ca"]').click(); await p.waitForTimeout(300);
console.log("after copy button:", await pill.locator('[data-testid="copy-ca"]').innerText(), "| clipboard:", await p.evaluate(() => navigator.clipboard.readText()));
console.log("links:", await pill.locator("a").evaluateAll(as => as.map(a => `${a.textContent.trim()} -> ${a.href} [${a.target}|${a.rel}]`)));
if (shots) await pill.screenshot({ path: `${shots}/live-launched-ca-pill.png` });
// planet claim panel
await p.goto(base + "/planets/earth", { waitUntil: "networkidle" }); await p.waitForTimeout(5000);
console.log("earth claim button(s):", await p.locator("button").filter({ hasText: /connect|claim/i }).allInnerTexts());
console.log("grid cells clickable:", await p.locator('[data-testid="claim-prelaunch"]').count() === 0 ? "pre-launch note gone" : "PRE-LAUNCH NOTE STILL THERE");
// mobile
const m = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await m.goto(base + "/", { waitUntil: "networkidle" }); await m.waitForTimeout(2500);
console.log("mobile CA text:", (await m.locator('[data-testid="token-ca"] code').first().innerText()));
if (shots) await m.screenshot({ path: `${shots}/live-launched-mobile.png` });
console.log(errs.length ? "CONSOLE ERRORS:\n" + errs.join("\n") : "no console errors");
await b.close();
