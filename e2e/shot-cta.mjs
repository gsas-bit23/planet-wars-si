import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto((process.env.BASE||"http://localhost:3005") + "/", { waitUntil: "networkidle" });
const el = p.locator('[data-testid="cta-launch"]'); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(2000);
console.log(await el.evaluate(e => { const r = e.getBoundingClientRect(); return [r.top, getComputedStyle(e.closest("section")).opacity, document.body.scrollHeight]; }));
await p.screenshot({ path: process.env.OUT || "/tmp/shots/cta-vp.png" }); await b.close();
