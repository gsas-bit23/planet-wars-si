import { chromium } from "playwright";
const base = process.env.BASE || "http://localhost:3005";
const paths = (process.env.PATHS || "/,/planets,/planets/jupiter,/marketplace,/leaderboard,/rewards,/claim,/broadcasts,/burn,/portfolio,/faucet").split(",");
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = []; p.on("console", m => { if (m.type() === "error") errs.push(`[${p.url()}] ${m.text().slice(0,200)}`); }); p.on("pageerror", e => errs.push(`[${p.url()}] PAGEERROR ${e.message.slice(0,200)}`));
for (const path of paths) {
  const r = await p.goto(base + path, { waitUntil: "networkidle", timeout: 120000 }).catch(() => null);
  await p.waitForTimeout(2500);
  const txt = (await p.locator("body").innerText()).replace(/\s+/g," ");
  const low = txt.toLowerCase(); const hits = ["testnet","test token","test pwsi","46630","faucet","0x80573f","not deployed","preview mode","explorer.testnet"].filter(w => low.includes(w));
  console.log(r?.status(), path, hits.length ? "TRACES: "+hits.join("|") : "clean");
  if (process.env.SHOTS) {
    // Scroll through so whileInView reveals fire before the full-page capture.
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); });
    await p.waitForTimeout(800);
  }
  if (path === "/") {
    const meta = await p.evaluate(() => ({ site: document.querySelector('meta[name="twitter:site"]')?.content, creator: document.querySelector('meta[name="twitter:creator"]')?.content, x: [...document.querySelectorAll('a[href="https://x.com/PlanetWSI"]')].map(a => `${a.target}|${a.rel}`) }));
    console.log("  twitter meta:", meta.site, meta.creator, "· X links:", meta.x.length, [...new Set(meta.x)].join(","));
  }
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/${path === "/" ? "home" : path.slice(1).replace(/\//g,"-")}.png`, fullPage: true });
}
console.log(errs.length ? errs.join("\n") : "no console errors"); await b.close();
