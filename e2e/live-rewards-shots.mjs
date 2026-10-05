import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs=[]; p.on("pageerror", e=>errs.push(e.message));
for (const [path, name] of [["/leaderboard","leaderboard"],["/rewards","rewards"],["/claim","claim"],["/burn","revenue"]]) {
  await p.goto("https://planet-wars-si.vercel.app"+path, { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `screenshots/live-${name}.png`, fullPage: true });
  console.log("shot", name);
}
console.log(errs.length? "errors: "+errs.join(" | ") : "no page errors"); await b.close();
