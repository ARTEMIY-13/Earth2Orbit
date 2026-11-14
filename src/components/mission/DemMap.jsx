import { useEffect, useMemo, useRef, useState } from "react";
import { pixelToLatLon } from "../../../shared/terrain/georef.js";
import { layerColors } from "./layers.js";
import { useLang } from "../../i18n/LanguageContext.jsx";

/**
 * 2D map of the DEM grid in its native projection (no reprojection).
 * Overlays are given in pixel coordinates.
 */
export default function DemMap({ meta, data, layers, layer, maxSlope, site, ellipseOutline, approachLine, polyline, track, footprints, contours, hover, mode, onPick, onPolylinePoint, onHoverPixel }) {
  const { lang } = useLang();
  const x = (uk, en) => (lang === "en" ? en : uk);
  const canvas = useRef(null);
  const [readout, setReadout] = useState(null);
  const { width: w, height: h } = meta;
  const base = useMemo(() => {
    const { rgb, zmin, zmax, rmax } = layerColors(layer, data, layers, maxSlope, w, h);
    const img = new ImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      img.data[i * 4] = rgb[i * 3];
      img.data[i * 4 + 1] = rgb[i * 3 + 1];
      img.data[i * 4 + 2] = rgb[i * 3 + 2];
      img.data[i * 4 + 3] = 255;
    }
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    off.getContext("2d").putImageData(img, 0, 0);
    return { off, zmin, zmax, rmax };
  }, [layer, data, layers, maxSlope, w, h]);

  useEffect(() => {
    const cv = canvas.current;
    const S = 2; // backing resolution per pixel
    cv.width = w * S;
    cv.height = h * S;
    const ctx = cv.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base.off, 0, 0, w * S, h * S);
    const P = (p) => [(p.col + 0.5) * S, (p.row + 0.5) * S];
    // risk hatching for "fail" pixels so the status is not colour-only
    if (layer === "risk" && layers?.slope) {
      ctx.strokeStyle = "rgba(255,255,255,.55)";
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let r = 0; r < h; r++)
        for (let c = 0; c < w; c++)
          if (layers.slope[r * w + c] > maxSlope) {
            ctx.moveTo(c * S, r * S + S);
            ctx.lineTo(c * S + S, r * S);
          }
      ctx.stroke();
    }
    if (contours?.levels) {
      ctx.strokeStyle = "rgba(255,255,255,.35)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (const lv of contours.levels)
        for (const [a, b] of lv.segs) {
          ctx.moveTo((a[0] + 0.5) * S, (a[1] + 0.5) * S);
          ctx.lineTo((b[0] + 0.5) * S, (b[1] + 0.5) * S);
        }
      ctx.stroke();
    }
    const poly = (pts, color, width = 2, dash = []) => {
      if (!pts?.length) return;
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(...P(p)) : ctx.moveTo(...P(p))));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    for (const fp of footprints || []) poly(fp, "#c084fc", 1.5, [3, 3]);
    poly(ellipseOutline, "#fbbf24", 2, [6, 4]);
    poly(approachLine, "#f472b6", 2);
    if (approachLine?.length === 2) {
      const [x, y] = P(approachLine[1]);
      ctx.fillStyle = "#f472b6";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 7);
      ctx.fill();
    }
    poly(polyline, "#a78bfa", 2);
    poly(track, "#60a5fa", 2);
    if (site) {
      const [x, y] = P(site);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, 7);
      ctx.moveTo(x - 11, y);
      ctx.lineTo(x + 11, y);
      ctx.moveTo(x, y - 11);
      ctx.lineTo(x, y + 11);
      ctx.stroke();
    }
    if (hover) {
      const [x, y] = P(hover);
      ctx.fillStyle = "#f472b6";
      ctx.strokeStyle = "#000";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
  }, [base, site, ellipseOutline, approachLine, polyline, track, footprints, contours, hover, layer, layers, maxSlope, w, h]);

  function toPixel(e) {
    const r = e.currentTarget.getBoundingClientRect();
    return { col: ((e.clientX - r.left) / r.width) * w - 0.5, row: ((e.clientY - r.top) / r.height) * h - 0.5 };
  }
  function info(p) {
    const c = Math.round(p.col),
      r = Math.round(p.row);
    if (c < 0 || r < 0 || c >= w || r >= h) return null;
    const ll = pixelToLatLon(meta.georef, p.col, p.row);
    const i = r * w + c;
    return { ...ll, z: data[i], slope: layers?.slope?.[i], col: c, row: r };
  }
  const legend =
    layer === "risk"
      ? [["#3caa6e", x(`ухил ≤ ${(0.7 * maxSlope).toFixed(1)}°`, `slope ≤ ${(0.7 * maxSlope).toFixed(1)}°`)], ["#eba828", `≤ ${maxSlope}°`], ["#c82832", x(`> ${maxSlope}° (штрихування)`, `> ${maxSlope}° (hatched)`)], ["#464650", "nodata"]]
      : layer === "slope"
        ? [["#f0f9e8", "0°"], ["#2b8cbe", "≈26°"], ["#084081", "≥ 40°"], ["#464650", "nodata"]]
        : layer === "roughness"
          ? [["#f0f9e8", "0 " + x("м", "m")], ["#084081", `${(base.rmax || 0).toFixed(1)} ${x("м", "m")}`], ["#464650", "nodata"]]
          : [["#18264a", `${base.zmin.toFixed(0)} ${x("м", "m")}`], ["#f5f0e1", `${base.zmax.toFixed(0)} ${x("м", "m")}`], ["#464650", "nodata"]];
  return (
    <div className="m-map">
      <canvas
        ref={canvas}
        tabIndex={0}
        role="application"
        aria-label={x(`2D-карта DEM ${meta.name}. Клацни, щоб ${mode === "polyline" ? "додати вершину профілю" : "обрати точку посадки"}. Стрілки зсувають точку.`, `2D DEM map ${meta.name}. Click to ${mode === "polyline" ? "add a profile vertex" : "pick the landing point"}. Arrow keys move the point.`)}
        style={{ aspectRatio: `${w} / ${h}` }}
        onClick={(e) => {
          const p = toPixel(e);
          if (mode === "polyline") onPolylinePoint?.(p);
          else onPick?.({ col: Math.round(p.col), row: Math.round(p.row) });
        }}
        onMouseMove={(e) => {
          const p = toPixel(e);
          setReadout(info(p));
          onHoverPixel?.(p);
        }}
        onMouseLeave={() => {
          setReadout(null);
          onHoverPixel?.(null);
        }}
        onKeyDown={(e) => {
          if (!site) return;
          const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
          if (d) {
            e.preventDefault();
            onPick?.({ col: Math.min(w - 2, Math.max(1, site.col + d[0])), row: Math.min(h - 2, Math.max(1, site.row + d[1])) });
          }
        }}
      />
      <div className="m-map-legend">
        {legend.map(([c, l]) => (
          <span key={l}>
            <i style={{ background: c }} /> {l}
          </span>
        ))}
        {meta.georef.type === "polar-stereographic" && <span className="m-muted">{x("Полярна стереографічна проєкція: «вгору» ≠ північ", "Polar stereographic projection: “up” ≠ north")}</span>}
      </div>
      <div className="m-readout" aria-live="polite">
        {readout
          ? `${readout.lat.toFixed(4)}°, ${readout.lon.toFixed(4)}° · ${Number.isFinite(readout.z) ? readout.z.toFixed(1) + " " + x("м", "m") : "nodata"} · ${x("ухил", "slope")} ${Number.isFinite(readout.slope) ? readout.slope.toFixed(1) + "°" : "—"}`
          : x("Наведи курсор на карту", "Hover over the map")}
      </div>
    </div>
  );
}
