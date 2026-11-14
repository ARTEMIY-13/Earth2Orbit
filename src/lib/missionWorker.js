// Main-thread client for mission.worker.js with cancellation and timeouts.
// Cancelling terminates the worker (a running loop cannot be interrupted
// otherwise); loaded DEMs are re-sent automatically on the next call.
import { bi } from "../i18n/bilingual.js";

export function createMissionClient() {
  let worker = null;
  let seq = 0;
  const pending = new Map();
  const loaded = new Map(); // id → {meta, buffer copy}

  function spawn() {
    worker = new Worker(new URL("../workers/mission.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => {
      const { id, ok, result, error, progress } = e.data;
      const p = pending.get(id);
      if (!p) return;
      if (progress !== undefined) {
        p.onProgress?.(progress);
        return;
      }
      clearTimeout(p.timer);
      pending.delete(id);
      if (ok) p.resolve(result);
      else p.reject(new Error(error));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error(bi("Помилка worker: ", "Worker error: ") + (e.message || "?")));
      }
      pending.clear();
    };
  }

  function call(type, payload, { timeout = 60000, onProgress, transfer = [] } = {}) {
    if (!worker) spawn();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        cancel("timeout");
        reject(new Error(bi("Перевищено час обчислення (" + Math.round(timeout / 1000) + " с)", "Computation timed out (" + Math.round(timeout / 1000) + " s)")));
      }, timeout);
      pending.set(id, { resolve, reject, timer, onProgress });
      worker.postMessage({ id, type, payload }, transfer);
    });
  }

  async function ensureLoaded(meta, buffer) {
    if (loaded.has(meta.id)) return loaded.get(meta.id).layers;
    const layers = await call("load", { meta, buffer: buffer.slice(0) });
    loaded.set(meta.id, { meta, buffer, layers });
    return layers;
  }

  function cancel(reason = "cancel") {
    if (!worker) return;
    worker.terminate();
    worker = null;
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Object.assign(new Error(reason === "cancel" ? bi("Скасовано", "Cancelled") : bi("Перервано", "Interrupted")), { name: "AbortError" }));
    }
    pending.clear();
    loaded.clear(); // grids are re-sent by the next ensureLoaded()
  }

  return {
    ensureLoaded,
    call,
    cancel,
    destroy() {
      cancel();
    },
  };
}
