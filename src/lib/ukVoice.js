// Український голос ОРІ без ключів і серверів: відкрита модель Piper
// «ukrainian_tts» (rhasspy/piper-voices, MIT) працює прямо в браузері через
// onnxruntime-web (WASM-файл рушія входить у збірку сайту). Модель читає звичайний текст (phoneme_type: "text"), тому
// фонемайзер не потрібен. Модель (~77 МБ) завантажується один раз і зберігається
// в Cache Storage браузера.
import { ukrainianNumber, normalizeUk } from "./ukText.js";

const MODEL_URL =
  "https://huggingface.co/rhasspy/piper-voices/resolve/main/uk/uk_UA/ukrainian_tts/medium/uk_UA-ukrainian_tts-medium.onnx";
const CACHE = "ori-voice-uk-v1";
export const UK_SPEAKERS = { lada: 0, mykyta: 1, tetiana: 2 };
export const UK_MODEL_MB = 77;

let loading = null;

async function cachedFetch(url, onProgress) {
  let cache = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return hit;
  } catch {
    /* Cache Storage недоступне (приватне вікно) — просто завантажуємо */
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error("voice model " + response.status);
  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body.getReader();
  const parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    loaded += value.byteLength;
    onProgress?.(total ? loaded / total : 0);
  }
  const blob = new Blob(parts);
  const copy = new Response(blob, { headers: { "Content-Type": response.headers.get("content-type") || "" } });
  try {
    await cache?.put(url, copy.clone());
  } catch {
    /* немає місця — працюємо без кешу */
  }
  return copy;
}

export async function isUkVoiceCached() {
  try {
    return Boolean(await (await caches.open(CACHE)).match(MODEL_URL));
  } catch {
    return false;
  }
}

export function loadUkVoice(onProgress) {
  if (!loading)
    loading = (async () => {
      const ortModule = await import("onnxruntime-web/wasm");
      const ort = ortModule.default || ortModule;
      ort.env.wasm.numThreads = 1; // без crossOriginIsolation (GitHub Pages)
      const config = await (await cachedFetch(MODEL_URL + ".json")).json();
      const model = await (await cachedFetch(MODEL_URL, onProgress)).arrayBuffer();
      const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
      return { ort, config, session };
    })().catch((error) => {
      loading = null;
      throw error;
    });
  return loading;
}

// Текст → ідентифікатори символів моделі (Piper text mode: lower + NFD).
export function textToIds(text, idMap) {
  const prepared = normalizeUk(text).toLowerCase().normalize("NFD");
  const pad = idMap._[0];
  const ids = [idMap["^"][0], pad];
  for (const ch of prepared) {
    const id = idMap[ch];
    if (!id) continue;
    ids.push(id[0], pad);
  }
  ids.push(idMap.$[0]);
  return ids;
}

// Ділимо на речення, щоб перше прозвучало швидко, поки синтезуються наступні.
export function splitSentences(text, max = 240) {
  const out = [];
  for (const raw of String(text).split(/(?<=[.!?…])\s+|\n+/)) {
    let s = raw.trim();
    while (s.length > max) {
      const cut = Math.max(s.lastIndexOf(",", max), s.lastIndexOf(" ", max));
      out.push(s.slice(0, cut > 40 ? cut : max));
      s = s.slice(cut > 40 ? cut + 1 : max).trim();
    }
    if (/[\p{L}\d]/u.test(s)) out.push(s);
  }
  return out;
}

async function synthesize(voice, sentence, speaker) {
  const { ort, config, session } = voice;
  const ids = textToIds(sentence, config.phoneme_id_map);
  const inf = config.inference;
  const feeds = {
    input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
    input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor("float32", Float32Array.from([inf.noise_scale, inf.length_scale * 1.05, inf.noise_w]), [3]),
  };
  if (config.num_speakers > 1) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([BigInt(speaker)]), [1]);
  const { output } = await session.run(feeds);
  return { pcm: output.data, rate: config.audio.sample_rate };
}

// Відтворювач: синтезує речення по черзі й програє їх без пауз через Web Audio.
// level() повертає гучність 0…1 для анімації рота аватара.
export function createUkSpeaker({ speaker = UK_SPEAKERS.lada, onStart, onEnd, onProgress, onError } = {}) {
  let ctx = null,
    analyser = null,
    run = 0;
  const data = new Uint8Array(256);
  function stop() {
    run++;
    if (ctx) {
      ctx.close().catch(() => {});
      ctx = null;
      analyser = null;
    }
  }
  async function speak(text) {
    stop();
    const id = run;
    const sentences = splitSentences(text);
    if (!sentences.length) return;
    try {
      const voice = await loadUkVoice(onProgress);
      if (id !== run) return;
      ctx = new AudioContext();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.connect(ctx.destination);
      let at = ctx.currentTime + 0.05,
        started = false,
        last = null;
      for (const sentence of sentences) {
        const { pcm, rate } = await synthesize(voice, sentence, speaker);
        if (id !== run || !ctx) return;
        const buffer = ctx.createBuffer(1, pcm.length, rate);
        buffer.copyToChannel(pcm, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        at = Math.max(at, ctx.currentTime + 0.02);
        source.start(at);
        at += buffer.duration + 0.12;
        last = source;
        if (!started) {
          started = true;
          onStart?.();
        }
      }
      if (last)
        last.onended = () => {
          if (id === run) {
            stop();
            onEnd?.();
          }
        };
    } catch (error) {
      if (id === run) onError?.(error);
    }
  }
  function level() {
    if (!analyser) return 0;
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const v of data) sum += (v - 128) ** 2;
    return Math.min(1, Math.sqrt(sum / data.length) / 40);
  }
  return { speak, stop, level };
}

export { ukrainianNumber };
