import {
  catalog,
  criteria,
  challenge,
  earthSites,
  methodologySource,
  filterAnalogs,
} from "../shared/catalog.js";
import {
  guideCommand,
  guideReply,
  placeActions,
  cleanCompareIds,
  projectFacts,
} from "./local-chat.mjs";
import { climateAt, coordinates } from "./climate.mjs";
import { aiProvider, askAI } from "./ai.mjs";
const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers });
}
const windows = new Map();
function rateLimited(request, scope, max) {
  const now = Date.now();
  for (const [key, value] of windows)
    if (value.until < now) windows.delete(key);
  const address = (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for") ||
    "anonymous"
  ).slice(0, 128);
  const key = scope + ":" + address,
    window = windows.get(key) || { count: 0, until: now + 60000 };
  if (window.count >= max || windows.size >= 2000) return true;
  window.count++;
  windows.set(key, window);
  return false;
}
export function matchSites(filters = {}) {
  return filterAnalogs(earthSites, filters);
}
async function body(request) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new Error("Потрібен JSON-запит.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Порожній запит.");
  let text = "",
    size = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) {
      await reader.cancel();
      throw new Error("Запит завеликий.");
    }
    text += decoder.decode(value, { stream: true });
  }
  try {
    return JSON.parse(text + decoder.decode());
  } catch {
    throw new Error("Некоректний JSON.");
  }
}
export async function handleAPI(request, env = {}, fetcher = fetch) {
  const url = new URL(request.url),
    path = url.pathname;
  if (request.method === "POST") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin && origin !== env.PUBLIC_ORIGIN)
      return json({ error: "Запит має надходити з цього сайту." }, 403);
  }
  if (
    ["/api/climate", "/api/candidates/evaluate"].includes(path) &&
    rateLimited(request, "climate", 60)
  )
    return json({ error: "Забагато запитів. Спробуй за хвилину." }, 429);
  if (request.method === "GET" && path === "/api/health")
    return json({
      ok: true,
      runtime: env.RUNTIME || "cloudflare-worker",
      framework: "React",
      catalogVersion: "2026-11-11",
    });
  if (request.method === "GET" && path === "/api/status")
  {
    const provider = aiProvider(env);
    return json({
      configured: Boolean(provider || env.LOCAL_GUIDE),
      local: !provider,
      provider: provider ? { id: provider.id, label: provider.label, model: provider.model, free: provider.id !== "openai" } : null,
    });
  }
  if (request.method === "GET" && path === "/api/catalog")
    return json({ worlds: catalog, criteria, challenge, methodologySource });
  if (request.method === "GET" && path === "/api/analogs") {
    const target = url.searchParams.get("target") || "all",
      traits = (url.searchParams.get("traits") || "")
        .split(",")
        .filter(Boolean),
      query = (url.searchParams.get("q") || "").slice(0, 100);
    if (
      !["all", "moon", "mars"].includes(target) ||
      traits.some((trait) => !criteria.some((item) => item.id === trait))
    )
      return json({ error: "Невідомий фільтр." }, 400);
    return json({
      sites: matchSites({ target, traits, query }),
      method:
        "Documented traits; all selected traits must match. Missing evidence remains unknown.",
    });
  }
  if (request.method === "GET" && path === "/api/climate") {
    if (
      !url.searchParams.has("lat") ||
      !url.searchParams.has("lon") ||
      url.searchParams.get("lat").trim() === "" ||
      url.searchParams.get("lon").trim() === ""
    )
      return json({ error: "Вкажи широту й довготу." }, 400);
    const lat = Number(url.searchParams.get("lat")),
      lon = Number(url.searchParams.get("lon"));
    try {
      coordinates(lat, lon);
    } catch (error) {
      return json({ error: error.message }, 400);
    }
    try {
      return json(await climateAt(lat, lon, fetcher));
    } catch (error) {
      return json({ error: error.message }, 502);
    }
  }
  if (request.method === "POST" && path === "/api/candidates/evaluate") {
    let data;
    try {
      data = await body(request);
      coordinates(data.lat, data.lon);
    } catch (error) {
      return json({ error: error.message }, 400);
    }
    if (
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.length > 100 ||
      !["moon", "mars"].includes(data.target) ||
      !Array.isArray(data.traits) ||
      data.traits.length > criteria.length ||
      data.traits.some((trait) => !criteria.some((item) => item.id === trait))
    )
      return json({ error: "Перевір назву, цільовий світ і ознаки." }, 400);
    let climate = null,
      climateError = null;
    try {
      climate = await climateAt(data.lat, data.lon, fetcher);
    } catch (error) {
      climateError = error.message;
    }
    const measuredTraits = [];
    if (climate?.precipitationMmDay !== null && climate?.precipitationMmDay < 1)
      measuredTraits.push({
        id: "aridity",
        rule: "Середні опади < 1 мм/день",
        source: "NASA POWER",
      });
    if (climate?.temperatureC !== null && climate?.temperatureC < 0)
      measuredTraits.push({
        id: "cold",
        rule: "Середня температура < 0 °C",
        source: "NASA POWER",
      });
    return json({
      id: crypto.randomUUID(),
      name: data.name.trim(),
      lat: data.lat,
      lon: data.lon,
      target: data.target,
      status: "unverified-candidate",
      declaredTraits: [...new Set(data.traits)],
      measuredTraits,
      climate,
      climateError,
      createdAt: new Date().toISOString(),
      method:
        "Кліматичні пороги — фільтри цього проєкту. Геологія, інженерні умови й придатність потребують окремих доказів.",
    });
  }
  if (request.method === "POST" && path === "/api/chat") {
    const provider = aiProvider(env);
    if (!provider && !env.LOCAL_GUIDE)
      return json(
        {
          error:
            "AI-чат очікує підключення API. Доступна підготовлена розповідь гіда.",
        },
        503,
      );
    if (rateLimited(request, "chat", 6))
      return json(
        { error: "Зачекай хвилину перед наступним запитанням." },
        429,
      );
    let data;
    try {
      data = await body(request);
    } catch (error) {
      return json({ error: error.message }, 400);
    }
    // Гід відповідає про весь проєкт; вибрана точка — необов’язковий контекст.
    const hasSelection = data.world != null || data.site != null;
    const world = hasSelection
        ? catalog.find((world) => world.id === data.world)
        : null,
      site = world ? world.places[data.site] : null;
    if (
      (hasSelection && (!site || !Number.isInteger(data.site))) ||
      !Array.isArray(data.messages) ||
      data.messages.length > 8 ||
      !data.messages.length ||
      data.messages.some(
        (m) =>
          !["user", "assistant"].includes(m.role) ||
          typeof m.content !== "string" ||
          m.content.length > 2200,
      ) ||
      data.messages.at(-1).role !== "user"
    )
      return json({ error: "Некоректне запитання або локація." }, 400);
    const lang = data.lang === "en" ? "en" : "uk",
      state = { compareIds: cleanCompareIds(data.compareIds) };
    // Команди (порівняння, кандидатури) детерміновані й не потребують моделі.
    const command = guideCommand(world, site, data.messages, lang, state);
    if (command) return json(command);
    const local = () => guideReply(world, site, data.messages, lang, state);
    if (!provider) return json({ ...local(), source: "local" });
    try {
      const text = await askAI(provider, lang, projectFacts(world, site), data.messages, fetcher);
      return json({
        text,
        actions: placeActions(world, site, data.messages, lang, state),
        source: "ai",
        provider: provider.label,
      });
    } catch (error) {
      // AI недоступний або вичерпано безкоштовний ліміт: відповідає локальний гід.
      return json({
        ...local(),
        source: "local",
        fallback: error.status === 429 ? "limit" : "unavailable",
        retryAfter: error.retryAfter ?? null,
      });
    }
  }
  return json({ error: "API-маршрут не знайдено." }, 404);
}
