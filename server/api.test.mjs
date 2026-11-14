import test from "node:test";
import assert from "node:assert/strict";
import { handleAPI, matchSites } from "./api.mjs";
import { climateAt } from "./climate.mjs";
const api = (path, options) =>
  new Request("https://orbital.test" + path, options);
const nasa = (temperature = 14.5, rain = 0.03) =>
  Response.json({
    header: { fill_value: -999, range: "2001–2025", sources: ["MERRA2"] },
    properties: {
      parameter: {
        T2M: { ANN: temperature },
        PRECTOTCORR: { ANN: rain },
        ALLSKY_SFC_SW_DWN: { ANN: 0 },
      },
    },
    parameters: {
      T2M: { units: "C" },
      PRECTOTCORR: { units: "mm/day" },
      ALLSKY_SFC_SW_DWN: { units: "kW-hr/m^2/day" },
    },
  });
test("catalog has structured locations and evidence sources", async () => {
  const response = await handleAPI(api("/api/catalog"));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.worlds.length, 4);
  assert.equal(data.worlds[0].places[0].name, "Пустеля Атакама");
  assert.ok(
    data.worlds[0].places[0].science.sources[0].url.startsWith(
      "https://www.jpl.nasa.gov/",
    ),
  );
  assert.equal(data.worlds[0].places[0].photos.length, 3);
});
test("filters require documented traits and target matches", () => {
  const matches = matchSites({ target: "moon", traits: ["basalt", "caves"] });
  assert.deepEqual(
    matches.map((site) => site.id),
    ["earth-10"],
  );
  assert.ok(
    matchSites({ target: "all" }).some(
      (site) => site.science.status === "candidate",
    ),
  );
});
test("invalid coordinates fail before an upstream request", async () => {
  let calls = 0;
  const response = await handleAPI(
    api("/api/climate?lat=999&lon=0"),
    {},
    async () => {
      calls++;
      return nasa();
    },
  );
  assert.equal(response.status, 400);
  assert.equal(calls, 0);
});
test("fill values stay unknown while zero remains a measurement", async () => {
  const result = await climateAt(12.3456, 45.6789, async () => nasa(-999, 0));
  assert.equal(result.temperatureC, null);
  assert.equal(result.precipitationMmDay, 0);
  assert.equal(result.solarKwhM2Day, 0);
});
test("concurrent climate requests share an upstream request", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return nasa();
  };
  const [a, b] = await Promise.all([
    climateAt(10.1111, 20.2222, fetcher),
    climateAt(10.1111, 20.2222, fetcher),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
});
test("candidate with unavailable climate does not invent matches", async () => {
  const response = await handleAPI(
    api("/api/candidates/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Кандидат",
        lat: 11.1111,
        lon: 22.2222,
        target: "mars",
        traits: ["basalt"],
      }),
    }),
    {},
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.climate, null);
  assert.deepEqual(result.measuredTraits, []);
  assert.deepEqual(result.declaredTraits, ["basalt"]);
  assert.equal(result.status, "unverified-candidate");
});
test("unsupported traits are rejected", async () => {
  const response = await handleAPI(
    api("/api/candidates/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        lat: 1,
        lon: 2,
        target: "mars",
        traits: ["made-up"],
      }),
    }),
  );
  assert.equal(response.status, 400);
});
test("unconfigured chat remains explicit", async () => {
  const response = await handleAPI(api("/api/chat", { method: "POST" }));
  assert.equal(response.status, 503);
});

test("local guide answers without an API key", async () => {
  const body = JSON.stringify({ world: "earth", site: 0, messages: [{ role: "user", content: "Які обмеження?" }] });
  const res = await handleAPI(api("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body }), { LOCAL_GUIDE: "1" });
  assert.equal(res.status, 200);
  assert.match((await res.json()).text, /Обмеження/);
});

test("local guide answers in English when requested", async () => {
  const body = JSON.stringify({
    world: "earth",
    site: 0,
    lang: "en",
    messages: [{ role: "user", content: "Why is this an analog?" }],
  });
  const response = await handleAPI(
    api("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }),
    { LOCAL_GUIDE: "1" },
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.text, /Atacama Desert is a Martian analog/i);
  assert.doesNotMatch(result.text, /[А-Яа-яІіЇїЄєҐґ]/);
});

let askCounter = 0;
// Окрема «адреса» на кожен запит, щоб ліміт чату (6/хв) не заважав тестам.
const ask = (payload, env = { LOCAL_GUIDE: "1" }) =>
  handleAPI(
    api("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "guide-test-" + ++askCounter,
      },
      body: JSON.stringify(payload),
    }),
    env,
  );
const say = (content) => ({ messages: [{ role: "user", content }] });

test("guide answers about the whole project without a selected point", async () => {
  const res = await ask(say("Що це за проєкт?"));
  assert.equal(res.status, 200);
  const { text } = await res.json();
  assert.match(text, /ORBITAL/);
  assert.match(text, /NASA Space Apps/);
});

test("guide lists the catalog with real counts", async () => {
  const { text } = await (await ask(say("Які є земні аналоги?"))).json();
  assert.match(text, /13 земних локацій/);
  assert.match(text, /Атакама/);
});

test("guide answers about a named place even when another point is selected", async () => {
  const { text } = await (
    await ask({ world: "earth", site: 0, ...say("Розкажи про Єзеро") })
  ).json();
  assert.match(text, /Єзеро/);
  assert.doesNotMatch(text, /Атакама/);
});

test("guide does not invent answers for unrelated questions", async () => {
  const { text } = await (
    await ask({ world: "earth", site: 0, ...say("Яка столиця Франції?") })
  ).json();
  assert.match(text, /немає відповіді/);
  assert.doesNotMatch(text, /координат|Chemical Laptop/);
});

test("guide answers in English without a point", async () => {
  const { text } = await (
    await ask({ lang: "en", ...say("Where does the data come from?") })
  ).json();
  assert.match(text, /NASA POWER/);
  assert.doesNotMatch(text, /[А-Яа-яІіЇїЄєҐґ]/);
});

test("guide asks to pick a point when 'this location' has no selection", async () => {
  const { text } = await (await ask(say("Чому ця локація — аналог?"))).json();
  assert.match(text, /не вибрано/);
});

test("chat rejects a half-specified selection", async () => {
  const res = await ask({ world: "earth", ...say("Привіт") });
  assert.equal(res.status, 400);
});

test("guide adds named Earth analogs to the comparison", async () => {
  const res = await (await ask(say("Додай Атакаму та Наміб до порівняння"))).json();
  const add = res.actions.find((a) => a.op === "add");
  assert.deepEqual(add.ids, ["earth-0", "earth-6"]);
  assert.equal(add.auto, true);
});

test("guide keeps the comparison at three and skips Moon/Mars points", async () => {
  const full = await (
    await ask({ compareIds: ["earth-0", "earth-1", "earth-2"], ...say("Додай Мохаве до порівняння") })
  ).json();
  assert.match(full.text, /Не вмістилося/);
  assert.ok(!full.actions.some((a) => a.op === "add"));
  const moon = await (await ask(say("Додай Кратер Шеклтон до порівняння"))).json();
  assert.match(moon.text, /лише для земних/);
  assert.deepEqual(moon.actions, []);
});

test("guide removes from and clears the comparison", async () => {
  const one = await (
    await ask({ compareIds: ["earth-0", "earth-1"], ...say("Прибери Атакаму з порівняння") })
  ).json();
  assert.deepEqual(one.actions[0], { type: "compare", op: "remove", ids: ["earth-0"], auto: true });
  const all = await (await ask(say("Очисти порівняння"))).json();
  assert.equal(all.actions[0].op, "clear");
});

test("guide prepares a candidate from one sentence", async () => {
  const res = await (
    await ask(say("Оформи кандидатуру Долина Смерті 36,5 -117,1 Марс сухість холод"))
  ).json();
  const fill = res.actions.find((a) => a.op === "fill");
  assert.deepEqual(fill.draft, {
    name: "Долина Смерті", lat: "36.5", lon: "-117.1", target: "mars", traits: ["aridity", "cold"],
  });
  assert.ok(res.actions.some((a) => a.op === "submit" && !a.auto));
});

test("guide evaluates right away when asked and validates coordinates", async () => {
  const go = await (
    await ask({ lang: "en", ...say("Create candidate \"Test Site\" 10 20 for the Moon isolation evaluate") })
  ).json();
  const submit = go.actions.find((a) => a.op === "submit");
  assert.equal(submit.auto, true);
  assert.equal(submit.draft.target, "moon");
  const bad = await (await ask(say("Створи кандидатуру Тест 123 200"))).json();
  assert.match(bad.text, /поза межами/);
  assert.deepEqual(bad.actions, []);
});

test("questions about comparison and candidates stay explanations", async () => {
  const how = await (await ask(say("Як додати кандидатуру?"))).json();
  assert.deepEqual(how.actions, []);
  assert.match(how.text, /Вкладка «Кандидат»/);
});

test("a place answer offers a quick add-to-comparison button", async () => {
  const res = await (await ask(say("Розкажи про Атакаму"))).json();
  assert.equal(res.actions[0].label.startsWith("⇄"), true);
});
