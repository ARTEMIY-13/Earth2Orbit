// У збірці для GitHub Pages Node-сервера немає, тому ті самі обробники /api
// виконуються прямо в браузері (NASA POWER викликається напряму).
const STATIC =
  import.meta.env.DEV ||
  import.meta.env.MODE === "pages" || import.meta.env.VITE_STATIC_API === "true";

export async function apiFetch(path, init = {}) {
  if (!STATIC) return fetch(path, init);
  const { handleAPI } = await import("../../server/api.mjs");
  const url = new URL(path, window.location.origin);
  return handleAPI(new Request(url, init), { RUNTIME: "browser-static", LOCAL_GUIDE: "1" });
}

// Шлях до ресурсу з public/ з урахуванням base (/ або /Earth2Orbit/).
export function asset(path) {
  if (/^(https?:)?\/\/|^data:/.test(path)) return path;
  return import.meta.env.BASE_URL + String(path).replace(/^\//, "");
}
