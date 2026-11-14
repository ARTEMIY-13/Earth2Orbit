import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { handleNodeAPI } from "./node-api.mjs";
import { handleAPI } from "./api.mjs";
import { decodePNG, terrariumHeight } from "./data/png.mjs";

const req = (p) => new Request("https://orbital.test" + p);

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
/** 256×256 RGB Terrarium tile with constant height h (filter type 0). */
function terrariumTile(h) {
  const v = h + 32768;
  const r = Math.floor(v / 256),
    g = Math.floor(v % 256),
    b = Math.round((v - Math.floor(v)) * 256);
  const raw = Buffer.alloc(256 * (1 + 256 * 3));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) raw.set([r, g, b], y * 769 + 1 + x * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(256, 0);
  ihdr.writeUInt32BE(256, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("PNG decoder + Terrarium encoding round-trip", () => {
  const png = decodePNG(terrariumTile(1234.5));
  assert.equal(png.width, 256);
  const o = (10 * 256 + 20) * 4;
  assert.equal(terrariumHeight(png.rgba[o], png.rgba[o + 1], png.rgba[o + 2]), 1234.5);
});

test("live Earth DEM: validates input and only contacts the Terrain Tiles host", async () => {
  assert.equal((await handleNodeAPI(req("/api/dem/earth?lat=95&lon=0"))).status, 400);
  const hosts = new Set();
  const fetcher = async (url) => {
    hosts.add(new URL(url).host);
    return new Response(terrariumTile(500));
  };
  const res = await handleNodeAPI(req("/api/dem/earth?lat=35.0271&lon=-111.0221&scale=fine"), fetcher);
  assert.equal(res.status, 200);
  const j = await res.json();
  assert.deepEqual([...hosts], ["s3.amazonaws.com"]);
  assert.equal(j.meta.width, 192);
  const data = new Float32Array(Uint8Array.from(Buffer.from(j.data, "base64")).buffer);
  assert.ok(data.every((v) => v === 500));
  assert.equal(j.meta.mask.status, "assumed");
});

test("live Earth DEM: upstream failure becomes a clear 502", async () => {
  const res = await handleNodeAPI(req("/api/dem/earth?lat=10.5&lon=10.5"), async () => new Response("no", { status: 503 }));
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /DEM/);
});

test("Horizons route: fixed upstream, explicit TDB epoch, input validation", async () => {
  assert.equal((await handleNodeAPI(req("/api/horizons?body=pluto&utc=2027-01-01T00:00:00Z"))).status, 400);
  let seen;
  const fetcher = async (url) => {
    seen = new URL(url);
    return Response.json({ signature: {}, result: "$$SOE\n2461407.500800740, A.D., 1.0, 2.0, 3.0, 0.1, 0.2, 0.3,\n$$EOE" });
  };
  const res = await handleNodeAPI(req("/api/horizons?body=mars&utc=2027-01-01T00:00:00Z"), fetcher);
  assert.equal(res.status, 200);
  assert.equal(seen.host, "ssd.jpl.nasa.gov");
  assert.equal(seen.searchParams.get("TIME_TYPE"), "'TDB'");
  assert.match(seen.searchParams.get("TLIST"), /^'2461406\.5008/);
  const j = await res.json();
  assert.deepEqual(j.r_m, [1000, 2000, 3000]);
});

test("static (browser/Pages) API reports Node-only features as unavailable", async () => {
  const caps = await (await handleAPI(req("/api/capabilities"), { RUNTIME: "browser-static" })).json();
  assert.equal(caps.demEarthOnDemand, false);
  assert.ok(caps.reason);
  assert.equal((await handleAPI(req("/api/dem/earth?lat=1&lon=1"), { RUNTIME: "browser-static" })).status, 501);
});
