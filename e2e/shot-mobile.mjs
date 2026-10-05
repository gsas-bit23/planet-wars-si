import { chromium } from "playwright";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await p.goto((process.env.BASE || "http://localhost:3005") + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.screenshot({ path: process.env.OUT || "/tmp/mobile.png" });
await p.getByRole("button", { name: /menu/i }).first().click().catch(() => {});
await p.waitForTimeout(800);
await p.screenshot({ path: (process.env.OUT || "/tmp/mobile.png").replace(".png", "-menu.png") });
await b.close();
