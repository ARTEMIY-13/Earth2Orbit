// Minimal Cloud-Optimized GeoTIFF reader (Node-only: uses node:zlib).
// Reads only the internal tiles that a window needs, via HTTP Range requests.
// Supports: classic TIFF and BigTIFF, little/big endian, tiled layout,
// compression 1 (none) / 8 & 32946 (deflate), predictor 1/2/3,
// sample formats uint (1), int (2), float (3) with 8/16/32/64 bits, 1 sample/pixel.
import { inflateSync } from "node:zlib";

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8, 17: 8, 18: 8 };

async function rangeFetch(fetcher, url, start, length, signal) {
  const res = await fetcher(url, { headers: { Range: `bytes=${start}-${start + length - 1}` }, signal });
  if (res.status === 404) throw Object.assign(new Error("COG not found: " + url.split("?")[0]), { code: 404 });
  if (res.status !== 206 && res.status !== 200) throw new Error(`COG HTTP ${res.status}: ${url.split("?")[0]}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return res.status === 200 ? buf.subarray(start, start + length) : buf;
}

export async function openCOG(url, { fetcher = fetch, signal } = {}) {
  let head = await rangeFetch(fetcher, url, 0, 65536, signal);
  let view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  const le = head[0] === 0x49;
  const big = view.getUint16(2, le) === 43;
  const u16 = (o) => view.getUint16(o, le);
  const u32 = (o) => view.getUint32(o, le);
  const u64 = (o) => Number(view.getBigUint64(o, le));
  const ensure = async (end) => {
    if (end <= head.length) return;
    const more = await rangeFetch(fetcher, url, 0, Math.max(end, head.length * 2), signal);
    head = more;
    view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  };
  async function readValues(type, count, valueOffset) {
    const size = TYPE_SIZE[type] * count;
    let data, dv;
    if (size <= (big ? 8 : 4)) {
      data = head.subarray(valueOffset, valueOffset + size);
    } else {
      const off = big ? u64(valueOffset) : u32(valueOffset);
      if (off + size <= head.length) data = head.subarray(off, off + size);
      else data = await rangeFetch(fetcher, url, off, size, signal);
    }
    dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const out = [];
    for (let i = 0; i < count; i++) {
      if (type === 3) out.push(dv.getUint16(i * 2, le));
      else if (type === 4) out.push(dv.getUint32(i * 4, le));
      else if (type === 16) out.push(Number(dv.getBigUint64(i * 8, le)));
      else if (type === 12) out.push(dv.getFloat64(i * 8, le));
      else if (type === 11) out.push(dv.getFloat32(i * 4, le));
      else if (type === 1 || type === 7) out.push(dv.getUint8(i));
      else if (type === 2) out.push(String.fromCharCode(dv.getUint8(i)));
      else if (type === 8) out.push(dv.getInt16(i * 2, le));
      else if (type === 9) out.push(dv.getInt32(i * 4, le));
      else throw new Error("Unsupported TIFF field type " + type);
    }
    return type === 2 ? out.join("").replace(/\0+$/, "") : out;
  }
  const ifds = [];
  let off = big ? u64(8) : u32(4);
  while (off && ifds.length < 12) {
    await ensure(off + 8);
    const n = big ? u64(off) : u16(off);
    const entry = big ? 20 : 12;
    await ensure(off + (big ? 8 : 2) + n * entry + (big ? 8 : 4));
    const tags = {};
    for (let i = 0; i < n; i++) {
      const e = off + (big ? 8 : 2) + i * entry;
      const tag = u16(e),
        type = u16(e + 2);
      const count = big ? u64(e + 4) : u32(e + 4);
      tags[tag] = await readValues(type, count, e + (big ? 12 : 8));
    }
    const one = (t, d) => (tags[t] ? tags[t][0] : d);
    const ifd = {
      width: one(256),
      height: one(257),
      bits: one(258, 1),
      compression: one(259, 1),
      samples: one(277, 1),
      predictor: one(317, 1),
      tileWidth: one(322),
      tileHeight: one(323),
      offsets: tags[324],
      counts: tags[325],
      sampleFormat: one(339, 1),
      scale: tags[33550],
      tiepoint: tags[33922],
      nodata: tags[42113] !== undefined ? Number(String(tags[42113]).trim()) : null,
      geoKeys: tags[34735],
    };
    if (!ifd.tileWidth) throw new Error("Only tiled (COG) TIFFs are supported");
    if (ifd.samples !== 1) throw new Error("Only single-band TIFFs are supported");
    ifds.push(ifd);
    off = big ? u64(off + 8 + n * entry) : u32(off + 2 + n * entry);
  }
  const base = ifds[0];
  // Geographic georeferencing (pixel-is-area): tiepoint maps raster (0,0) to (lon, lat) of the corner.
  // GTRasterTypeGeoKey (1025): 1 = PixelIsArea (tiepoint = pixel corner), 2 = PixelIsPoint (= pixel centre).
  let rasterType = 1;
  const gk = base.geoKeys;
  if (gk) for (let i = 4; i + 3 < gk.length; i += 4) if (gk[i] === 1025 && gk[i + 1] === 0) rasterType = gk[i + 3];
  const geo =
    base.scale && base.tiepoint
      ? {
          dLon: base.scale[0],
          dLat: base.scale[1],
          rasterType: rasterType === 2 ? "PixelIsPoint" : "PixelIsArea",
          // centre of pixel (0,0):
          lonC0: base.tiepoint[3] + (rasterType === 2 ? 0 : base.scale[0] / 2),
          latC0: base.tiepoint[4] - (rasterType === 2 ? 0 : base.scale[1] / 2),
        }
      : null;
  const cache = new Map();

  function makeArray(ifd, n) {
    const { bits, sampleFormat } = ifd;
    if (sampleFormat === 3) return bits === 64 ? new Float64Array(n) : new Float32Array(n);
    if (sampleFormat === 2) return bits === 8 ? new Int8Array(n) : bits === 16 ? new Int16Array(n) : new Int32Array(n);
    return bits === 8 ? new Uint8Array(n) : bits === 16 ? new Uint16Array(n) : new Uint32Array(n);
  }

  async function readTile(level, tx, ty) {
    const ifd = ifds[level];
    const across = Math.ceil(ifd.width / ifd.tileWidth);
    const idx = ty * across + tx;
    const key = level + ":" + idx;
    if (cache.has(key)) return cache.get(key);
    const promise = (async () => {
      const n = ifd.tileWidth * ifd.tileHeight;
      if (!ifd.counts[idx]) return null; // sparse tile → nodata
      let raw = await rangeFetch(fetcher, url, ifd.offsets[idx], ifd.counts[idx], signal);
      if (ifd.compression === 8 || ifd.compression === 32946) raw = new Uint8Array(inflateSync(raw));
      else if (ifd.compression !== 1) throw new Error("Unsupported TIFF compression " + ifd.compression);
      const bps = ifd.bits / 8;
      const w = ifd.tileWidth;
      if (ifd.predictor === 3) {
        // floating-point predictor: byte-wise horizontal differencing, then byte un-shuffling
        const rowBytes = w * bps;
        const out = new Uint8Array(raw.length);
        for (let r = 0; r < ifd.tileHeight; r++) {
          const row = raw.subarray(r * rowBytes, (r + 1) * rowBytes);
          for (let i = 1; i < rowBytes; i++) row[i] = (row[i] + row[i - 1]) & 255;
          for (let i = 0; i < w; i++)
            for (let b = 0; b < bps; b++) out[r * rowBytes + i * bps + (le ? bps - 1 - b : b)] = row[b * w + i];
        }
        raw = out;
      }
      const arr = makeArray(ifd, n);
      const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      for (let i = 0; i < n; i++) {
        const o = i * bps;
        if (ifd.sampleFormat === 3) arr[i] = bps === 8 ? dv.getFloat64(o, le) : dv.getFloat32(o, le);
        else if (bps === 1) arr[i] = ifd.sampleFormat === 2 ? dv.getInt8(o) : dv.getUint8(o);
        else if (bps === 2) arr[i] = ifd.sampleFormat === 2 ? dv.getInt16(o, le) : dv.getUint16(o, le);
        else arr[i] = ifd.sampleFormat === 2 ? dv.getInt32(o, le) : dv.getUint32(o, le);
      }
      if (ifd.predictor === 2)
        for (let r = 0; r < ifd.tileHeight; r++) for (let c = 1; c < w; c++) arr[r * w + c] += arr[r * w + c - 1];
      return arr;
    })();
    cache.set(key, promise);
    return promise;
  }

  /** Value at integer pixel (level 0 unless given); null outside or in sparse tile. */
  async function getPixel(col, row, level = 0) {
    const ifd = ifds[level];
    if (col < 0 || row < 0 || col >= ifd.width || row >= ifd.height) return null;
    const tx = Math.floor(col / ifd.tileWidth),
      ty = Math.floor(row / ifd.tileHeight);
    const t = await readTile(level, tx, ty);
    if (!t) return null;
    return t[(row - ty * ifd.tileHeight) * ifd.tileWidth + (col - tx * ifd.tileWidth)];
  }

  /** Reads a rectangular window (level 0 or overview) into a Float64 array (NaN = nodata/outside). */
  async function readWindow(x0, y0, w, h, level = 0) {
    const ifd = ifds[level];
    const out = new Float64Array(w * h).fill(NaN);
    const tx0 = Math.max(0, Math.floor(x0 / ifd.tileWidth)),
      tx1 = Math.min(Math.ceil(ifd.width / ifd.tileWidth) - 1, Math.floor((x0 + w - 1) / ifd.tileWidth));
    const ty0 = Math.max(0, Math.floor(y0 / ifd.tileHeight)),
      ty1 = Math.min(Math.ceil(ifd.height / ifd.tileHeight) - 1, Math.floor((y0 + h - 1) / ifd.tileHeight));
    const jobs = [];
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) jobs.push([tx, ty]);
    if (jobs.length > 64) throw new Error("Вікно потребує забагато внутрішніх тайлів COG");
    const tiles = await Promise.all(jobs.map(([tx, ty]) => readTile(level, tx, ty)));
    jobs.forEach(([tx, ty], k) => {
      const t = tiles[k];
      if (!t) return;
      for (let r = 0; r < ifd.tileHeight; r++) {
        const gy = ty * ifd.tileHeight + r - y0;
        if (gy < 0 || gy >= h || ty * ifd.tileHeight + r >= ifd.height) continue;
        for (let c = 0; c < ifd.tileWidth; c++) {
          const gx = tx * ifd.tileWidth + c - x0;
          if (gx < 0 || gx >= w || tx * ifd.tileWidth + c >= ifd.width) continue;
          const v = t[r * ifd.tileWidth + c];
          out[gy * w + gx] = ifd.nodata !== null && v === ifd.nodata ? NaN : v;
        }
      }
    });
    return out;
  }
  return { ifds, geo, readTile, readWindow, getPixel, littleEndian: le, bigTiff: big };
}
