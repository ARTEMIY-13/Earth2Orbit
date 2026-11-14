import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { handleNodeAPI } from "./node-api.mjs";
import { handleAPI } from "./api.mjs";
import { openCOG } from "./data/geotiff.mjs";

const req = (p) => new Request("https://orbital.test" + p);

/**
 * Writes a minimal tiled little-endian GeoTIFF (deflate) — TEST ONLY.
 * kind: "f32p3" (float32, floating-point predictor) | "i16" | "u8".
 */
function makeCOG({ width, height, tile, kind, value, lonC0, latC0, step, nodata }) {
  const bps = kind === "f32p3" ? 4 : kind === "i16" ? 2 : 1;
  const across = Math.ceil(width / tile), down = Math.ceil(height / tile);
  const tiles = [];
  for (let ty = 0; ty < down; ty++)
    for (let tx = 0; tx < across; tx++) {
      const raw = Buffer.alloc(tile * tile * bps);
      for (let r = 0; r < tile; r++)
        for (let c = 0; c < tile; c++) {
          const v = value(tx * tile + c, ty * tile + r);
          const o = (r * tile + c) * bps;
          if (kind === "f32p3") raw.writeFloatLE(v, o);
          else if (kind === "i16") raw.writeInt16LE(v, o);
          else raw.writeUInt8(v, o);
        }
      let body = raw;
      if (kind === "f32p3") {
        // encode floating-point predictor: big-endian byte planes, then horizontal byte differencing
        body = Buffer.alloc(raw.length);
        const rowBytes = tile * 4;
        for (let r = 0; r < tile; r++) {
          const row = Buffer.alloc(rowBytes);
          for (let i = 0; i < tile; i++) for (let b = 0; b < 4; b++) row[b * tile + i] = raw[r * rowBytes + i * 4 + (3 - b)];
          for (let i = rowBytes - 1; i > 0; i--) row[i] = (row[i] - row[i - 1]) & 255;
          row.copy(body, r * rowBytes);
        }
      }
      tiles.push(deflateSync(body));
    }
  const entries = [];
  const extra = [];
  let extraOff = 8 + 2 + 20 * 12 + 4;
  const put = (tag, type, values) => {
    const size = { 3: 2, 4: 4, 12: 8, 2: 1 }[type];
    const buf = Buffer.alloc(values.length * size);
    values.forEach((v, i) => (type === 3 ? buf.writeUInt16LE(v, i * 2) : type === 4 ? buf.writeUInt32LE(v, i * 4) : type === 12 ? buf.writeDoubleLE(v, i * 8) : buf.writeUInt8(v, i)));
    if (buf.length <= 4) entries.push([tag, type, values.length, Buffer.concat([buf, Buffer.alloc(4 - buf.length)])]);
    else {
      const off = Buffer.alloc(4);
      off.writeUInt32LE(extraOff);
      entries.push([tag, type, values.length, off]);
      extra.push(buf);
      extraOff += buf.length;
    }
  };
  const tileDataStart = () => extraOff;
  put(256, 4, [width]);
  put(257, 4, [height]);
  put(258, 3, [bps * 8]);
  put(259, 3, [8]);
  put(277, 3, [1]);
  put(317, 3, [kind === "f32p3" ? 3 : 1]);
  put(322, 3, [tile]);
  put(323, 3, [tile]);
  put(339, 3, [kind === "f32p3" ? 3 : kind === "i16" ? 2 : 1]);
  put(33550, 12, [step, step, 0]);
  put(33922, 12, [0, 0, 0, lonC0, latC0, 0]);
  put(34735, 3, [1, 1, 0, 1, 1025, 0, 1, 2]); // PixelIsPoint
  if (nodata !== undefined) put(42113, 2, [...Buffer.from(String(nodata) + "\0")]);
  // offsets/counts last (they depend on where tile data starts)
  const countsIdx = entries.length;
  put(325, 4, tiles.map((t) => t.length));
  put(324, 4, tiles.map(() => 0));
  let pos = tileDataStart();
  const offsets = tiles.map((t) => ((pos += t.length), pos - t.length));
  const offBuf = extra[extra.length - 1];
  offsets.forEach((o, i) => offBuf.writeUInt32LE(o, i * 4));
  entries.sort((a, b) => a[0] - b[0]);
  void countsIdx;
  const head = Buffer.alloc(8);
  head.write("II", 0, "ascii");
  head.writeUInt16LE(42, 2);
  head.writeUInt32LE(8, 4);
  const ifd = Buffer.alloc(2 + 20 * 12 + 4);
  ifd.writeUInt16LE(entries.length, 0);
  entries.forEach(([tag, type, count, val], i) => {
    ifd.writeUInt16LE(tag, 2 + i * 12);
    ifd.writeUInt16LE(type, 4 + i * 12);
    ifd.writeUInt32LE(count, 6 + i * 12);
    val.copy(ifd, 10 + i * 12);
  });
  return Buffer.concat([head, ifd, ...extra, ...tiles]);
}
const serve = (files) => async (url, init = {}) => {
  const key = Object.keys(files).find((k) => url.split("?")[0].endsWith(k));
  if (url.includes("/api/sas/")) return Response.json({ token: "sig=test" });
  if (!key) return new Response("missing", { status: 404 });
  const buf = files[key];
  const m = /bytes=(\d+)-(\d+)/.exec(init.headers?.Range || "");
  if (!m) return new Response(buf);
  return new Response(buf.subarray(+m[1], +m[2] + 1), { status: 206 });
};

test("COG reader: float predictor, int16, tiles, PixelIsPoint georeferencing", async () => {
  const f = makeCOG({ width: 40, height: 40, tile: 16, kind: "f32p3", value: (c, r) => c * 1.5 - r * 0.25 - 86.3, lonC0: -117, latC0: 37, step: 1 / 3600 });
  const cog = await openCOG("https://x.test/a.tif", { fetcher: serve({ "a.tif": f }) });
  assert.equal(cog.geo.rasterType, "PixelIsPoint");
  assert.equal(cog.geo.lonC0, -117);
  const w = await cog.readWindow(10, 20, 5, 3);
  assert.ok(Math.abs(w[0] - (10 * 1.5 - 20 * 0.25 - 86.3)) < 1e-4, "value " + w[0]);
  assert.ok(Math.abs(w[14] - (14 * 1.5 - 22 * 0.25 - 86.3)) < 1e-4);
  const i = makeCOG({ width: 20, height: 20, tile: 16, kind: "i16", value: (c) => (c === 3 ? -32768 : 100 + c), lonC0: 0, latC0: 1, step: 1 / 3600, nodata: -32768 });
  const ci = await openCOG("https://x.test/i.tif", { fetcher: serve({ "i.tif": i }) });
  const wi = await ci.readWindow(0, 0, 18, 1);
  assert.ok(Number.isNaN(wi[3]), "nodata → NaN");
  assert.equal(wi[17], 117, "value across tile boundary");
});

test("live Earth DEM: Copernicus + WorldCover mask; below-sea-level land is kept", async () => {
  assert.equal((await handleNodeAPI(req("/api/dem/earth?lat=95&lon=0"))).status, 400);
  const id = "Copernicus_DSM_COG_10_N36_00_W117_00_DEM";
  const dem = makeCOG({ width: 3600, height: 3600, tile: 256, kind: "f32p3", value: () => -85, lonC0: -117, latC0: 37, step: 1 / 3600 });
  // WorldCover (3°×3° tile): class 80 (water) west of lon −116.5, 60 (bare) east of it
  const st = 3 / 4096;
  const wc = makeCOG({ width: 4096, height: 4096, tile: 512, kind: "u8", value: (c) => (-117 + (c + 0.5) * st < -116.5 ? 80 : 60), lonC0: -117 + st / 2, latC0: 39 - st / 2, step: st });
  const hosts = new Set();
  const base = serve({ [`${id}.tif`]: dem, "ESA_WorldCover_10m_2021_v200_N36W117_Map.tif": wc });
  const fetcher = (url, init) => (hosts.add(new URL(url).host), base(url, init));
  const res = await handleNodeAPI(req("/api/dem/earth?lat=36.5&lon=-116.5&scale=fine"), fetcher);
  assert.equal(res.status, 200, await res.clone().text());
  const j = await res.json();
  assert.deepEqual([...hosts].sort(), ["copernicus-dem-30m.s3.amazonaws.com", "esa-worldcover.s3.eu-central-1.amazonaws.com"]);
  const data = new Float32Array(Uint8Array.from(Buffer.from(j.data, "base64")).buffer);
  const valid = Array.from(data).filter((v) => v === v);
  assert.ok(valid.length > 0 && valid.every((v) => v === -85), "−85 m land kept (not treated as sea)");
  // western half is WorldCover water → masked; eastern half kept
  const row = 96 * 192;
  assert.ok(Number.isNaN(data[row + 10]), "water pixel masked");
  assert.equal(data[row + 180], -85);
  assert.ok(j.meta.mask.maskedFraction > 0.4 && j.meta.mask.maskedFraction < 0.6);
  assert.equal(j.meta.mask.status, "derived");
  assert.equal(j.meta.georef.type, "geographic");
});

test("live Earth DEM: missing tile (ocean) and upstream failure become clear errors", async () => {
  const res = await handleNodeAPI(req("/api/dem/earth?lat=10.5&lon=-30.5"), serve({}));
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /тайла DEM/);
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
