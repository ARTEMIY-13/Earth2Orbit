#!/usr/bin/env node
// Records the real Earth2Orbit site in a real (headed, GPU-accelerated) Chromium.
// Frames come from the Chrome DevTools screencast: page content only — no tabs,
// address bar, desktop or notifications. Nothing in the product is modified; the
// only injected element is a recording cursor indicator (pointer-events: none).
//
//   node demo/record.mjs [--url http://localhost:3000] [--out demo/out/raw]
//
// Output: <out>/frames/*.jpg, <out>/frames.json (timestamps), <out>/marks.json
import { chromium } from "playwright";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const URL_ = arg("--url", "http://localhost:3000");
const OUT = resolve(arg("--out", "demo/out/raw"));
const W = 1920,
  H = 1080;
// Supersampled capture (CSS viewport stays 1920×1080) so zoom-ins on panels stay sharp.
const DSF = Number(arg("--dsf", "1.5"));

await rm(OUT, { recursive: true, force: true });
await mkdir(resolve(OUT, "frames"), { recursive: true });

const browser = await chromium.launch({
  headless: false,
  args: [
    `--window-size=${W},${H + 120}`,
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--disable-features=CalculateNativeWinOcclusion",
    "--hide-scrollbars",
    "--force-color-profile=srgb",
    "--enable-gpu-rasterization",
    "--ignore-gpu-blocklist",
  ],
});
const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, locale: "en-US", timezoneId: "Europe/Kyiv" });
// English UI, default panel width/scale; recording cursor overlay (not part of the product)
await context.addInitScript(() => {
  try {
    localStorage.setItem("lang", "en");
    localStorage.removeItem("orbital.panelWidth");
    localStorage.removeItem("orbital.interfaceScale");
  } catch {}
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.id = "__rec_cursor";
    c.style.cssText = "position:fixed;left:0;top:0;width:28px;height:28px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none";
    c.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 28 28"><path d="M4 2 L4 22 L9.5 17 L13 25.5 L16.5 24 L13 15.8 L20.5 15.8 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const ring = document.createElement("div");
    ring.style.cssText = "position:fixed;left:0;top:0;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid rgba(131,245,222,.95);z-index:2147483646;pointer-events:none;opacity:0;transform:scale(.4)";
    document.body.appendChild(ring);
    addEventListener("mousemove", (e) => (c.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`), true);
    addEventListener(
      "mousedown",
      (e) => {
        ring.style.left = e.clientX + "px";
        ring.style.top = e.clientY + "px";
        ring.animate([{ opacity: 1, transform: "scale(.4)" }, { opacity: 0, transform: "scale(1.4)" }], { duration: 450, easing: "ease-out" });
      },
      true,
    );
  });
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

const frames = [];
let frameNo = 0;
const pending = [];
cdp.on("Page.screencastFrame", async (f) => {
  const n = frameNo++;
  const file = `frames/${String(n).padStart(6, "0")}.jpg`;
  frames.push({ file, t: f.metadata.timestamp });
  pending.push(writeFile(resolve(OUT, file), Buffer.from(f.data, "base64")));
  try {
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
  } catch {}
});

const marks = {};
const boxes = {};
const now = () => Date.now() / 1000;
const mark = (name) => {
  marks[name] = now();
  console.log("mark", name);
};
const wait = (ms) => page.waitForTimeout(ms);
let cursor = { x: W * 0.35, y: H * 0.55 };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
async function moveTo(x, y, ms = 900) {
  const steps = Math.max(8, Math.round(ms / 16));
  const sx = cursor.x,
    sy = cursor.y;
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(sx + (x - sx) * k, sy + (y - sy) * k);
    await wait(ms / steps);
  }
  cursor = { x, y };
}
async function center(locator) {
  await locator.waitFor({ state: "visible" });
  const b = await locator.boundingBox();
  return { x: b.x + Math.min(b.width / 2, 140), y: b.y + b.height / 2, box: b };
}
async function clickOn(locator, ms = 900, name) {
  const c = await center(locator);
  await moveTo(c.x, c.y, ms);
  await wait(120);
  if (name) mark(name);
  await page.mouse.down();
  await wait(70);
  await page.mouse.up();
  return c;
}
async function smoothScroll(selector, top, ms = 1200) {
  await page.evaluate(
    ([sel, target, dur]) =>
      new Promise((res) => {
        const el = document.querySelector(sel);
        const start = el.scrollTop,
          t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / dur);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          el.scrollTop = start + (target - start) * e;
          if (k < 1) requestAnimationFrame(step);
          else res();
        };
        requestAnimationFrame(step);
      }),
    [selector, top, ms],
  );
}
async function scrollIntoPanel(locator, offset = 90, ms = 1200) {
  const top = await locator.evaluate((el, off) => {
    const panel = document.querySelector(".explorer");
    return el.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - off;
  }, offset);
  await smoothScroll(".explorer", top, ms);
}
const box = async (name, locator) => {
  const b = await locator.boundingBox();
  boxes[name] = b;
};

// ---------------------------------------------------------------------------
await page.goto(URL_, { waitUntil: "networkidle" });
const gl = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const g = c.getContext("webgl2") || c.getContext("webgl");
  if (!g) return "NO WEBGL";
  const ext = g.getExtension("WEBGL_debug_renderer_info");
  return ext ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
});
console.log("WebGL renderer:", gl);
if (gl === "NO WEBGL") throw new Error("WebGL unavailable — refusing to record");
// wait until all planet textures are loaded
await page.waitForFunction(() => /loaded|завантажено/i.test(document.querySelector(".texture-status")?.textContent || ""), null, { timeout: 120000 });
await page.mouse.move(cursor.x, cursor.y);
await wait(2500);

await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: Math.round(W * DSF), maxHeight: Math.round(H * DSF), everyNthFrame: 1 });
await wait(1200);

// S1 — Earth hero (team card background)
mark("earth_hero");
await wait(4500);

// S2/S3 — fly to Mars
const marsBtn = page.locator(".planet-nav button", { hasText: "Mars" });
await clickOn(marsBtn, 1100, "mars_click");
await wait(4200);

// S3 — pick Jezero Crater from the Mars list
const jezero = page.locator(".place", { hasText: "Jezero Crater" });
const jc = await center(jezero);
await moveTo(jc.x, jc.y, 1400);
await wait(150);
mark("jezero_click");
await page.mouse.down();
await wait(70);
await page.mouse.up();
await page.waitForFunction(() => [...document.querySelectorAll(".gallery img")].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
await wait(2600);

// S4a — scroll to Earth analogs, open Atacama Desert
const analogsHeading = page.locator(".evidence-section h3", { hasText: "Earth analogs for this world" });
mark("scroll_analogs");
await scrollIntoPanel(analogsHeading, 120, 1100);
await wait(250);
const atacama = page.locator(".evidence-section .place", { hasText: "Atacama Desert" });
const ac = await center(atacama);
await moveTo(ac.x, ac.y, 800);
await wait(120);
mark("atacama_click");
await page.mouse.down();
await wait(70);
await page.mouse.up();
await page.waitForFunction(() => [...document.querySelectorAll(".gallery img")].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
await wait(2400);
mark("atacama_detail");
await wait(1500);

// S4b — NASA POWER climate panel (live data from the Node API → NASA POWER)
const power = page.locator(".data-panel");
await page.waitForFunction(() => /°C/.test(document.querySelector(".data-panel")?.textContent || ""), null, { timeout: 60000 });
mark("scroll_power");
await scrollIntoPanel(power, 110, 1100);
await wait(300);
await box("power", power);
await moveTo(boxes.power.x + boxes.power.width * 0.55, boxes.power.y + boxes.power.height * 0.45, 900);
mark("power_hold");
await wait(4000);

// S4c — map of the Earth analog (Leaflet + OpenStreetMap)
const mapBtn = page.locator("button", { hasText: "View this location on the map" });
await scrollIntoPanel(mapBtn, 380, 700);
await wait(200);
await clickOn(mapBtn, 800, "map_click");
await page.waitForFunction(() => document.querySelectorAll(".leaflet-tile-loaded").length >= 6, null, { timeout: 30000 });
await wait(1200);
mark("map_hold");
await wait(2800);
await page.keyboard.press("Escape");
await wait(800);

// add Atacama + Devon Island to the comparison (not shown in the cut)
await page.locator("button", { hasText: "Add to comparison" }).click();
await wait(300);
await page.locator("button", { hasText: "All locations" }).click();
await wait(600);
await page.locator(".place", { hasText: "Devon Island" }).first().click();
await wait(1200);
await page.locator("button", { hasText: "Add to comparison" }).click();
await wait(400);
await smoothScroll(".explorer", 0, 400);
await wait(500);

// S4d/S5 — compare the evidence
const compareTab = page.locator(".tabbar button", { hasText: "Compare" });
await clickOn(compareTab, 900, "compare_click");
await wait(1800);
mark("compare_hold");
await wait(3200);
const limits = page.locator(".explorer p", { hasText: "cannot fully reproduce" });
mark("scroll_limits");
await scrollIntoPanel(page.locator(".explorer table tr", { hasText: "Isolation" }), 140, 1400);
await wait(400);
await box("compare", page.locator(".explorer table"));
await box("limits", limits);
await moveTo(boxes.limits.x - 40, boxes.limits.y + boxes.limits.height + 60, 900); // keep the cursor off the text
mark("limits_hold");
await wait(4500);

// S6 — end card background: back to Earth overview
await page.mouse.move(-50, -50);
cursor = { x: -50, y: -50 };
await page.locator(".planet-nav button", { hasText: "Earth" }).click();
mark("end_click");
await wait(5500);

await cdp.send("Page.stopScreencast");
await Promise.all(pending);
await writeFile(resolve(OUT, "frames.json"), JSON.stringify(frames));
await writeFile(resolve(OUT, "marks.json"), JSON.stringify({ marks, boxes, viewport: { W, H, DSF }, webgl: gl, url: URL_, recorded: new Date().toISOString() }, null, 1));
const span = frames.at(-1).t - frames[0].t;
console.log(`frames: ${frames.length} over ${span.toFixed(1)} s → ${(frames.length / span).toFixed(1)} fps avg`);
await browser.close();
