// У збірці для GitHub Pages Node-сервера немає, тому ті самі обробники /api
// виконуються прямо в браузері (NASA POWER викликається напряму, гід ОРІ —
// локальна база знань). Під час розробки спершу перевіряємо, чи працює Node-сервер
// (npm run dev:server): тоді /api, зокрема AI-чат, іде через нього, бо ключі й
// безкоштовні AI-сервіси доступні лише з боку сервера.
const FORCED_STATIC = import.meta.env.MODE === "pages" || import.meta.env.VITE_STATIC_API === "true";
let serverProbe = null;

function hasServer() {
  if (FORCED_STATIC) return Promise.resolve(false);
  if (!import.meta.env.DEV) return Promise.resolve(true);
  serverProbe ??= fetch("/api/health", { headers: { Accept: "application/json" } })
    .then(async (response) => response.ok && (await response.json()).ok === true)
    .catch(() => false);
  return serverProbe;
}

export async function apiFetch(path, init = {}) {
  if (await hasServer()) return fetch(path, init);
  const { handleAPI } = await import("../../server/api.mjs");
  const url = new URL(path, window.location.origin);
  return handleAPI(new Request(url, init), { RUNTIME: "browser-static", LOCAL_GUIDE: "1" });
}

// Шлях до ресурсу з public/ з урахуванням base (/ або /Earth2Orbit/).
export function asset(path) {
  if (/^(https?:)?\/\/|^data:/.test(path)) return path;
  return import.meta.env.BASE_URL + String(path).replace(/^\//, "");
}
