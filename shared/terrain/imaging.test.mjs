import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOdeProducts, odeQueryUrl, IMAGING_PRODUCTS, parseIndexRecord } from "./imaging.js";

// Fixtures are real ODE responses saved on 2026-11-14 (server/data/fixtures).
const fx = (n) => JSON.parse(readFileSync("server/data/fixtures/" + n, "utf8"));

test("LROC NAC geometry comes from product metadata; altitude from the PDS index record", () => {
  const ps = parseOdeProducts(fx("ode-lroc-apollo11.json"), "moon");
  assert.ok(ps.length >= 1);
  const p = ps[0];
  assert.equal(p.productId, "M102000149RC.IMG");
  assert.equal(p.emission_deg, 11.76);
  assert.equal(p.incidence_deg, 79.75);
  assert.equal(p.phase_deg, 91.51);
  assert.equal(p.spacecraftAltitude_km, 113.29);
  assert.ok(p.footprint.length >= 4);
});

test("HiRISE: angles present, spacecraft altitude explicitly unavailable (not invented)", () => {
  const ps = parseOdeProducts(fx("ode-hirise-jezero.json"), "mars");
  assert.ok(ps.length >= 1);
  assert.ok(Number.isFinite(ps[0].emission_deg) && Number.isFinite(ps[0].incidence_deg));
  assert.equal(ps[0].spacecraftAltitude_km, null);
  assert.equal(ps[0].spacecraftAltitudeSource, "not-published-needs-spice");
});

test("ODE errors are surfaced, polar queries use full longitude range, index records parse", () => {
  assert.throws(() => parseOdeProducts({ ODEResults: { Status: "ERROR", Error: "bad" } }, "moon"), /ODE: bad/);
  const u = new URL(odeQueryUrl(IMAGING_PRODUCTS.moon, -89.99, 10));
  assert.equal(u.searchParams.get("westlon"), "0");
  assert.equal(u.searchParams.get("eastlon"), "360");
  const w = new URL(odeQueryUrl(IMAGING_PRODUCTS.mars, 0, -10)).searchParams.get("westlon");
  assert.ok(Number(w) > 340, "negative east longitudes converted to 0–360");
  assert.deepEqual(parseIndexRecord('"A", 1.5,"B C",-2'), ["A", "1.5", "B C", "-2"]);
});
