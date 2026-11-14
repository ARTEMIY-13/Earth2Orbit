#!/usr/bin/env node
// Turns screencast frames (variable timing) into a constant 30 fps master clip.
//   node demo/raw-to-video.mjs [--raw demo/out/raw] → <raw>/raw.mp4 (+ t0 in raw.json)
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const RAW = resolve(arg("--raw", "demo/out/raw"));
const frames = JSON.parse(await readFile(resolve(RAW, "frames.json"), "utf8"));
const t0 = frames[0].t;
let list = "ffconcat version 1.0\n";
for (let i = 0; i < frames.length; i++) {
  const d = i + 1 < frames.length ? frames[i + 1].t - frames[i].t : 1 / 30;
  list += `file '${frames[i].file}'\nduration ${Math.max(0.001, d).toFixed(6)}\n`;
}
list += `file '${frames.at(-1).file}'\n`;
await writeFile(resolve(RAW, "frames.ffconcat"), list);
execFileSync(
  "ffmpeg",
  ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", "frames.ffconcat", "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2:in_range=pc:out_range=tv,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-color_range", "tv", "raw.mp4"],
  { cwd: RAW, stdio: "inherit" },
);
await writeFile(resolve(RAW, "raw.json"), JSON.stringify({ t0, fps: 30 }));
console.log("raw.mp4 ready; t0 =", t0);
