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
