#!/usr/bin/env node
// Edits the real screen recording into the 29.5 s contest demo (FFmpeg).
//   node demo/edit.mjs [--raw demo/out/raw] [--out demo/out]
// Produces: Earth2Orbit_demo_clean.mp4 (titles, no speech subtitles),
//           Earth2Orbit_demo_subtitled.mp4 (titles + English subtitles),
//           Earth2Orbit_en.srt, titles.ass, speech.ass
// Team and on-screen texts live in demo/content.json (single source of truth).
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const RAW = resolve(arg("--raw", "demo/out/raw"));
const OUT = resolve(arg("--out", "demo/out"));
await mkdir(OUT, { recursive: true });
const C = JSON.parse(await readFile(resolve("demo/content.json"), "utf8"));
// --speech <json>: cues re-timed to a real voice-over (written by add-voiceover.mjs)
if (arg("--speech")) C.speech = JSON.parse(await readFile(resolve(arg("--speech")), "utf8"));
const ONLY = arg("--only"); // "clean" | "subtitled"
const M = JSON.parse(await readFile(resolve(RAW, "marks.json"), "utf8"));
const R = JSON.parse(await readFile(resolve(RAW, "raw.json"), "utf8"));
const mk = (n) => M.marks[n] - R.t0; // seconds into raw.mp4
const DSF = M.viewport.DSF || 1;
const TOTAL = 29.5;
const XF = 0.3; // crossfade length

// Zoom windows in CSS px of the 1920×1080 viewport (16:9), derived from recorded boxes.
function zoomTo(box, width, anchor = "center", dy = 0) {
  const w = width,
    h = Math.round((width * 9) / 16);
  let x = box.x + box.width / 2 - w / 2;
  if (anchor === "right") x = 1920 - w;
  let y = box.y + box.height / 2 - h / 2 + dy;
  x = Math.max(0, Math.min(1920 - w, x));
  y = Math.max(0, Math.min(1080 - h, y));
  return { x, y, w, h };
}
const B = M.boxes;
// Scenes: output duration d, source start s (raw seconds), optional zoom
const scenes = [
  { id: "team", d: 2.0, s: mk("earth_hero") + 0.3 },
  { id: "question", d: 3.0, s: mk("mars_click") - 0.35 },
  { id: "solution", d: 5.0, s: mk("jezero_click") - 2.85 },
  { id: "analog", d: 3.4, s: mk("atacama_click") - 1.9 },
  { id: "power-arrive", d: 1.0, s: mk("power_hold") - 0.9 },
  { id: "power", d: 2.4, s: mk("power_hold") + 0.15, zoom: zoomTo(B.power, 820, "right", 40) },
  { id: "map", d: 1.6, s: mk("map_hold") },
  { id: "compare", d: 1.6, s: mk("compare_click") - 0.8 },
  { id: "matches", d: 3.1, s: mk("compare_hold"), zoom: zoomTo(B.compare, 960, "right", -10) },
  { id: "limits", d: 2.9, s: mk("limits_hold") - 1.0, zoom: zoomTo(B.limits, 960, "right", -40) },
  { id: "end", d: 3.5, s: mk("end_click") + 1.6 },
];
// Output timeline (xfade overlaps shorten each join by XF)
let t = 0;
const timeline = scenes.map((sc, i) => {
  const start = t;
  t += sc.d;
  return { ...sc, start, end: t, inDur: sc.d + (i < scenes.length - 1 ? XF : 0) };
});
const total = t;
if (Math.abs(total - TOTAL) > 1e-6) throw new Error(`timeline is ${total.toFixed(3)} s, expected ${TOTAL}`);
const at = (id) => timeline.find((s) => s.id === id);

// ---- ASS subtitles ----------------------------------------------------------
const ts = (x) => {
  const cs = Math.round(x * 100);
  const h = Math.floor(cs / 360000),
    m = Math.floor((cs % 360000) / 6000),
    s = Math.floor((cs % 6000) / 100),
    c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
const FONT = C.font || "Segoe UI";
const head = (styles) => `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styles.join("\n")}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
// colours are &HAABBGGRR
const styles = [
  `Style: Hero,${FONT} Semibold,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,0,3,5,80,80,0,1`,
  `Style: HeroSub,${FONT},44,&H00DEF583,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,0,2,5,80,80,0,1`,
  `Style: Small,${FONT},32,&H00E6F0F5,&H00FFFFFF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,0,2,5,80,80,0,1`,
  `Style: Label,${FONT} Semibold,46,&H00FFFFFF,&H00FFFFFF,&H00261A0A,&H3C120A06,1,0,0,0,100,100,0,0,3,14,0,8,60,560,104,1`,
  `Style: LabelSub,${FONT},30,&H00DEF583,&H00FFFFFF,&H00261A0A,&H3C120A06,0,0,0,0,100,100,0,0,3,10,0,8,60,560,176,1`,
  `Style: Speech,${FONT} Semibold,44,&H00FFFFFF,&H00FFFFFF,&H00000000,&H28000000,1,0,0,0,100,100,0,0,3,12,0,2,80,560,104,1`,
];
const esc = (s) => s.replace(/\{/g, "(").replace(/\}/g, ")").replace(/\n/g, "\\N");
const ev = (a, b, style, text, extra = "") => `Dialogue: 0,${ts(a)},${ts(b)},${style},,0,0,0,,${extra}${esc(text)}`;
const fade = "{\\fad(180,180)}";
const T = C.titles;
const lines = [];
// team card & end card: centred over a dimmed frame
lines.push(ev(0.08, at("team").end - 0.05, "Hero", T.team.name, "{\\fad(120,200)\\pos(960,470)\\fs72}"));
lines.push(ev(0.08, at("team").end - 0.05, "HeroSub", T.team.members, "{\\fad(120,200)\\pos(960,570)\\fs40\\c&HFFFFFF&}"));
lines.push(ev(0.08, at("team").end - 0.05, "Small", T.team.event, "{\\fad(120,200)\\pos(960,640)\\c&HDEF583&}"));
// problem
lines.push(ev(at("question").start + 0.1, at("question").end - 0.05, "Label", T.question, fade));
lines.push(ev(at("question").start + 0.35, at("question").end - 0.05, "LabelSub", T.challenge, fade));
// solution
lines.push(ev(at("solution").start + 0.1, at("solution").start + 2.75, "Hero", T.product, "{\\fad(200,200)\\an7\\pos(80,330)\\fs96}"));
lines.push(ev(at("solution").start + 0.3, at("solution").start + 2.75, "HeroSub", T.tagline, "{\\fad(200,200)\\an7\\pos(84,450)}"));
lines.push(ev(at("solution").start + 2.8, at("solution").end - 0.05, "Label", T.select, fade));
lines.push(ev(at("solution").start + 2.95, at("solution").end - 0.05, "LabelSub", T.selectSub, fade));
// how it works
lines.push(ev(at("analog").start + 0.05, at("power-arrive").end - 0.05, "Label", T.analog, fade));
lines.push(ev(at("analog").start + 0.2, at("power-arrive").end - 0.05, "LabelSub", T.analogSub, fade));
// zoomed scenes: the panel fills the right side → labels sit in the free left area
const leftL = "{\\fad(180,180)\\an7\\pos(64,150)}";
const leftS = "{\\fad(180,180)\\an7\\pos(66,232)}";
lines.push(ev(at("power").start, at("power").end - 0.05, "Label", T.power, leftL));
lines.push(ev(at("power").start + 0.15, at("power").end - 0.05, "LabelSub", T.powerSub, leftS));
// map: one compact label above the modal so it never covers the map or its title
lines.push(ev(at("map").start + 0.05, at("map").end - 0.05, "Label", T.mapSub, "{\\fad(180,180)\\fs36\\an8\\pos(960,40)}"));
lines.push(ev(at("compare").start + 0.05, at("compare").end - 0.05, "Label", T.compare, fade));
// result
lines.push(ev(at("matches").start + 0.05, at("matches").end - 0.05, "Label", T.matches, leftL));
lines.push(ev(at("matches").start + 0.15, at("matches").end - 0.05, "LabelSub", T.matchesSub, leftS));
lines.push(ev(at("limits").start + 0.05, at("limits").end - 0.05, "Label", T.limits, leftL));
lines.push(ev(at("limits").start + 0.15, at("limits").end - 0.05, "LabelSub", T.limitsSub, leftS));
// end card
const e0 = at("end").start;
lines.push(ev(e0 + 0.15, TOTAL - 0.02, "Hero", T.product, "{\\fad(250,0)\\pos(960,420)\\fs104}"));
lines.push(ev(e0 + 0.35, TOTAL - 0.02, "HeroSub", T.endTagline, "{\\fad(250,0)\\pos(960,530)\\fs48\\c&HFFFFFF&}"));
lines.push(ev(e0 + 0.55, TOTAL - 0.02, "HeroSub", T.url, "{\\fad(250,0)\\pos(960,620)\\fs44}"));
lines.push(ev(e0 + 0.7, TOTAL - 0.02, "Small", T.endSmall, "{\\fad(250,0)\\pos(960,700)}"));
await writeFile(resolve(OUT, "titles.ass"), head(styles) + lines.join("\n") + "\n");

// speech subtitles (preliminary timing; re-timed to real audio by add-voiceover.mjs)
const cues = C.speech.map((c) => ({ ...c, start: c.start, end: c.end }));
// a cue that mostly overlaps a zoomed scene is confined to the free left area (never over the panel)
const zoomed = timeline.filter((sc) => sc.zoom);
const inZoom = (c) => zoomed.some((z) => Math.min(c.end, z.end) - Math.max(c.start, z.start) > 0.5 * (c.end - c.start));
const speechAss =
  head(styles) +
  cues
    .map((c) =>
      inZoom(c)
        ? `Dialogue: 0,${ts(c.start)},${ts(c.end)},Speech,,64,${1920 - 900},230,,{\\fad(100,100)\\an1\\fs40}${esc(c.text)}`
        : ev(c.start, c.end, "Speech", c.text, "{\\fad(100,100)}"),
    )
    .join("\n") +
  "\n";
await writeFile(resolve(OUT, "speech.ass"), speechAss);
const srtTime = (x) => {
  const ms = Math.round(x * 1000);
  const h = Math.floor(ms / 3600000),
    m = Math.floor((ms % 3600000) / 60000),
    s = Math.floor((ms % 60000) / 1000),
    r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(r).padStart(3, "0")}`;
};
await writeFile(resolve(OUT, arg("--srt-name", "Earth2Orbit_en.srt")), cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join("\n"));

// ---- FFmpeg graph -------------------------------------------------------------
const inputs = [];
const chains = [];
timeline.forEach((sc, i) => {
  inputs.push("-ss", sc.s.toFixed(3), "-t", sc.inDur.toFixed(3), "-i", resolve(RAW, "raw.mp4"));
  let f = `[${i}:v]setpts=PTS-STARTPTS,fps=30`;
  if (sc.zoom) {
    const z = sc.zoom;
    f += `,crop=${Math.round(z.w * DSF)}:${Math.round(z.h * DSF)}:${Math.round(z.x * DSF)}:${Math.round(z.y * DSF)}`;
  }
  f += `,scale=1920:1080:flags=lanczos:out_range=tv,setsar=1,format=yuv420p`;
  if (sc.id === "team" || sc.id === "end") f += `,drawbox=x=0:y=0:w=iw:h=ih:color=0x020814@0.62:t=fill`;
  chains.push(`${f}[v${i}]`);
});
let prev = "v0";
let offset = 0;
for (let i = 1; i < timeline.length; i++) {
  offset += timeline[i - 1].d;
  const out = i === timeline.length - 1 ? "base" : `x${i}`;
  chains.push(`[${prev}][v${i}]xfade=transition=fade:duration=${XF}:offset=${(offset - 0).toFixed(3)}[${out}]`);
  prev = out;
}
const fontsdir = "C\\:/Windows/Fonts";
const render = (name, subs) => {
  const assChain = subs.map((f) => `subtitles=${f}:fontsdir='${fontsdir}'`).join(",");
  const graph = chains.join(";") + `;[base]${assChain},trim=0:${TOTAL},setpts=PTS-STARTPTS[outv]`;
  execFileSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[outv]", "-an", "-r", "30", "-c:v", "libx264", "-profile:v", "high", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-movflags", "+faststart", "-t", String(TOTAL), name],
    { cwd: OUT, stdio: "inherit" },
  );
  console.log("rendered", name);
};
if (ONLY !== "subtitled") render("Earth2Orbit_demo_clean.mp4", ["titles.ass"]);
if (ONLY !== "clean") render(arg("--subtitled-name", "Earth2Orbit_demo_subtitled.mp4"), ["titles.ass", "speech.ass"]);
await writeFile(resolve(OUT, "timeline.json"), JSON.stringify(timeline.map(({ id, start, end, s, zoom }) => ({ id, start, end, src: s, zoom })), null, 1));
