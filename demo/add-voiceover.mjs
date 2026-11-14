#!/usr/bin/env node
// Adds the AI voice-over in one command and re-times the English subtitles to
// the real speech.
//
//   node demo/add-voiceover.mjs path/to/voice.mp3 [--offset 2.15] [--gap 0.18] [--noise -35]
//
// 1. Checks that offset + audio length fits inside 29.5 s. If not, it STOPS —
//    it never cuts words; shorten the text or regenerate the voice instead.
// 2. Finds speech segments with FFmpeg silencedetect and aligns the subtitle
//    cues (demo/content.json → speech) to the real pauses, in order.
// 3. Re-renders the subtitled cut with the re-timed subtitles and muxes audio:
//      demo/out/Earth2Orbit_demo_voice_subtitled.mp4
//      demo/out/Earth2Orbit_demo_voice_clean.mp4
//      demo/out/Earth2Orbit_en_synced.srt
// Requires the raw recording (demo/out/raw) from demo/record.mjs.
import { readFile, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const audio = process.argv[2] && !process.argv[2].startsWith("--") ? resolve(process.argv[2]) : null;
if (!audio) {
  console.error("Usage: node demo/add-voiceover.mjs voice.mp3 [--offset 2.15]");
  process.exit(2);
}
await access(audio);
const TOTAL = 29.5;
const OFFSET = Number(arg("--offset", "2.15")); // speech starts with the problem scene
const OUT = resolve("demo/out");
const C = JSON.parse(await readFile(resolve("demo/content.json"), "utf8"));

const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
const dur = probe(audio);
const latest = TOTAL - 0.1;
console.log(`voice-over: ${dur.toFixed(2)} s, starts at ${OFFSET} s → ends at ${(OFFSET + dur).toFixed(2)} s (limit ${latest} s)`);
if (OFFSET + dur > latest) {
  console.error(
    `\n✕ The voice-over is ${(OFFSET + dur - latest).toFixed(2)} s too long for the 29.5 s cut.\n` +
      `  Nothing was cut. Shorten demo/Earth2Orbit_voiceover_en.txt or regenerate the voice a little faster,\n` +
      `  or lower --offset (minimum 0) if the opening can carry speech.`,
  );
  process.exit(1);
}

// --- speech segments from silencedetect -------------------------------------
const sd = spawnSync("ffmpeg", ["-hide_banner", "-i", audio, "-af", `silencedetect=noise=${arg("--noise", "-35")}dB:d=${arg("--gap", "0.18")}`, "-f", "null", "-"], { encoding: "utf8" });
const log = sd.stderr;
const silences = [];
let s0 = null;
for (const line of log.split("\n")) {
  const a = /silence_start: ([\d.]+)/.exec(line);
  const b = /silence_end: ([\d.]+)/.exec(line);
  if (a) s0 = Number(a[1]);
  if (b && s0 !== null) {
    silences.push([s0, Number(b[1])]);
    s0 = null;
  }
}
if (s0 !== null) silences.push([s0, dur]);
// speech = complement of silences
const speech = [];
let cur = 0;
for (const [a, b] of silences) {
  if (a - cur > 0.05) speech.push([cur, a]);
  cur = b;
}
if (dur - cur > 0.05) speech.push([cur, dur]);
if (!speech.length) throw new Error("No speech detected — check the audio file or --noise");

// --- align cues to speech: split points at the pauses nearest to text-length shares
const cues = C.speech;
const weights = cues.map((c) => c.text.replace(/\s+/g, " ").length);
const totalW = weights.reduce((a, b) => a + b, 0);
const speechTotal = speech.reduce((a, [x, y]) => a + (y - x), 0);
// map "speech-time" (silences removed) → audio time
const audioTimeAt = (st) => {
  let acc = 0;
  for (const [x, y] of speech) {
    if (acc + (y - x) >= st) return x + (st - acc);
    acc += y - x;
  }
  return speech.at(-1)[1];
};
const gaps = silences.map(([a, b]) => (a + b) / 2);
let acc = 0;
const bounds = [speech[0][0]];
for (let i = 0; i < cues.length - 1; i++) {
  acc += weights[i];
  const ideal = audioTimeAt((acc / totalW) * speechTotal);
  // snap to the nearest pause (if one is close), else keep the proportional point
  const near = gaps.filter((g) => g > bounds.at(-1) + 0.4).sort((p, q) => Math.abs(p - ideal) - Math.abs(q - ideal))[0];
  bounds.push(near !== undefined && Math.abs(near - ideal) < 0.9 ? near : ideal);
}
bounds.push(speech.at(-1)[1]);
const synced = cues.map((c, i) => {
  // trim each cue to the speech it contains
  const a = bounds[i],
    b = bounds[i + 1];
  const inside = speech.filter(([x, y]) => y > a && x < b);
  const start = inside.length ? Math.max(a, inside[0][0]) : a;
  const end = inside.length ? Math.min(b, inside.at(-1)[1]) : b;
  return { text: c.text, start: +(OFFSET + start - 0.05).toFixed(3), end: +(OFFSET + end + 0.25).toFixed(3) };
});
// no overlaps, keep within the cut
for (let i = 0; i < synced.length; i++) {
  if (i + 1 < synced.length) synced[i].end = Math.min(synced[i].end, synced[i + 1].start - 0.04);
  synced[i].end = Math.min(synced[i].end, TOTAL - 0.05);
}
const syncedFile = resolve(OUT, "speech_synced.json");
await writeFile(syncedFile, JSON.stringify(synced, null, 1));
console.log("re-timed cues:");
for (const c of synced) console.log(`  ${c.start.toFixed(2)}–${c.end.toFixed(2)}  ${c.text.replace(/\n/g, " ")}`);

// --- re-render the subtitled cut with synced cues, then mux audio --------------
execFileSync(process.execPath, ["demo/edit.mjs", "--speech", syncedFile, "--only", "subtitled", "--subtitled-name", "_synced_subtitled.mp4", "--srt-name", "Earth2Orbit_en_synced.srt"], { stdio: "inherit" });
const mux = (video, out) =>
  execFileSync(
    "ffmpeg",
    ["-y", "-hide_banner", "-loglevel", "error", "-i", video, "-i", audio, "-filter_complex", `[1:a]aresample=48000,adelay=${Math.round(OFFSET * 1000)}:all=1,apad[a]`, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-t", String(TOTAL), "-movflags", "+faststart", out],
    { cwd: OUT, stdio: "inherit" },
  );
mux("_synced_subtitled.mp4", "Earth2Orbit_demo_voice_subtitled.mp4");
mux("Earth2Orbit_demo_clean.mp4", "Earth2Orbit_demo_voice_clean.mp4");
for (const f of ["Earth2Orbit_demo_voice_subtitled.mp4", "Earth2Orbit_demo_voice_clean.mp4"]) {
  const d = probe(resolve(OUT, f));
  console.log(`${f}: ${d.toFixed(3)} s`);
  if (d > 30) throw new Error(f + " is longer than 30 s");
}
