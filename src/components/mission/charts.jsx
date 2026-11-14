import { useEffect, useMemo, useRef } from "react";

const W = 640;
const PH = 200;
const PPAD = { l: 56, r: 12, t: 22, b: 34 };
const SH = 170;
const SPAD = { l: 56, r: 12, t: 20, b: 26 };
const fmt = (v, d = 0) => (v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d));

function niceTicks(min, max, n = 5) {
  if (!(max > min)) return [min];
  const step0 = (max - min) / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

/**
 * Elevation profile chart. X = distance (m), Y = elevation (m, dataset datum).
 * Gaps are drawn as breaks. The vertical exaggeration of the drawing is shown.
 */
export function ProfileChart({ profile, title, datum, onHover, hoverIndex, color = "var(--m-accent)" }) {
  const geom = useMemo(() => {
    if (!profile?.points?.length) return null;
    const pts = profile.points;
    const zs = pts.filter((p) => p.z !== null).map((p) => p.z);
    if (!zs.length) return { empty: true };
    let zmin = Math.min(...zs),
      zmax = Math.max(...zs);
    if (zmax - zmin < 1) {
      zmin -= 0.5;
      zmax += 0.5;
    }
    const L = profile.length_m || 1;
    const sx = (W - PPAD.l - PPAD.r) / L,
      sy = (PH - PPAD.t - PPAD.b) / (zmax - zmin);
    const x = (d) => PPAD.l + d * sx,
      y = (z) => PH - PPAD.b - (z - zmin) * sy;
    let path = "",
      pen = false;
    for (const p of pts) {
      if (p.z === null) {
        pen = false;
        continue;
      }
      path += (pen ? "L" : "M") + x(p.d).toFixed(1) + " " + y(p.z).toFixed(1);
      pen = true;
    }
    const gaps = [];
    let g0 = null;
    pts.forEach((p, i) => {
      if (p.z === null && g0 === null) g0 = p.d;
      if ((p.z !== null || i === pts.length - 1) && g0 !== null) {
        gaps.push([g0, p.d]);
        g0 = null;
      }
    });
    return { x, y, path, zmin, zmax, L, exaggeration: sy / sx, gaps, xt: niceTicks(0, L), yt: niceTicks(zmin, zmax, 4) };
  }, [profile]);
  if (!geom) return <p className="m-muted">Профіль ще не побудовано.</p>;
  if (geom.empty) return <p className="m-muted">Уздовж лінії немає даних DEM.</p>;
  const hp = hoverIndex !== null && hoverIndex !== undefined ? profile.points[hoverIndex] : null;
  function move(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const d = (((e.clientX - rect.left) / rect.width) * W - PPAD.l) / (W - PPAD.l - PPAD.r) * geom.L;
    let best = 0;
    profile.points.forEach((p, i) => {
      if (Math.abs(p.d - d) < Math.abs(profile.points[best].d - d)) best = i;
    });
    onHover?.(best);
  }
  return (
    <figure className="m-chart">
      <figcaption>
        <b>{title}</b> · {fmt(profile.length_m)} м · min {fmt(profile.min?.z, 1)} / max {fmt(profile.max?.z, 1)} м · макс. ухил {fmt(profile.maxGrade_deg, 1)}° ·
        прогалини {profile.gaps} · <span title="Співвідношення вертикального й горизонтального масштабу малюнка; на розрахунки не впливає">верт. перебільшення ×{fmt(geom.exaggeration, 1)}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${PH}`} role="img" aria-label={`${title}: висота від ${fmt(profile.min?.z)} до ${fmt(profile.max?.z)} м на ${fmt(profile.length_m)} м`} onMouseMove={move} onMouseLeave={() => onHover?.(null)}>
        {geom.gaps.map(([a, b], i) => (
          <rect key={i} x={geom.x(a)} y={PPAD.t} width={Math.max(2, geom.x(b) - geom.x(a))} height={PH - PPAD.t - PPAD.b} className="m-gap" />
        ))}
        {geom.yt.map((v) => (
          <g key={"y" + v}>
            <line x1={PPAD.l} x2={W - PPAD.r} y1={geom.y(v)} y2={geom.y(v)} className="m-grid" />
            <text x={PPAD.l - 6} y={geom.y(v) + 4} textAnchor="end" className="m-tick">{fmt(v)}</text>
          </g>
        ))}
        {geom.xt.map((v) => (
          <text key={"x" + v} x={geom.x(v)} y={PH - PPAD.b + 16} textAnchor="middle" className="m-tick">{v >= 1000 ? fmt(v / 1000, 1) + " км" : fmt(v) + " м"}</text>
        ))}
        <text x={12} y={PPAD.t - 8} className="m-axis">висота, м ({datum})</text>
        <text x={W - PPAD.r} y={PH - 4} textAnchor="end" className="m-axis">відстань</text>
        <path d={geom.path} fill="none" stroke={color} strokeWidth="2" />
        {profile.min && <circle cx={geom.x(profile.min.d)} cy={geom.y(profile.min.z)} r="3.5" className="m-min" />}
        {profile.max && <circle cx={geom.x(profile.max.d)} cy={geom.y(profile.max.z)} r="3.5" className="m-max" />}
        {hp && hp.z !== null && (
          <g>
            <line x1={geom.x(hp.d)} x2={geom.x(hp.d)} y1={PPAD.t} y2={PH - PPAD.b} className="m-cursor" />
            <circle cx={geom.x(hp.d)} cy={geom.y(hp.z)} r="5" className="m-hover" />
            <text x={Math.min(W - 150, geom.x(hp.d) + 8)} y={PPAD.t + 12} className="m-tick">
              {fmt(hp.d)} м · {fmt(hp.z, 1)} м{hp.grade !== undefined ? ` · ${fmt(hp.grade, 1)}°` : ""}
            </text>
          </g>
        )}
      </svg>
    </figure>
  );
}

/** Multi-series time chart with a cursor at time t. series: [{key,label,color,unit}] */
export function SeriesChart({ samples, series, t, title, onSeek }) {
  const geom = useMemo(() => {
    if (!samples?.length) return null;
    const t0 = samples[0].t,
      t1 = samples[samples.length - 1].t || 1;
    const stride = Math.max(1, Math.floor(samples.length / 600));
    return series.map((s) => {
      const vals = samples.map((p) => p[s.key]).filter((v) => v !== null && Number.isFinite(v));
      let min = Math.min(...vals, s.zero ? 0 : Infinity),
        max = Math.max(...vals);
      if (max - min < 1e-9) max = min + 1;
      const x = (tt) => SPAD.l + ((tt - t0) / (t1 - t0 || 1)) * (W - SPAD.l - SPAD.r);
      const y = (v) => SH - SPAD.b - ((v - min) / (max - min)) * (SH - SPAD.t - SPAD.b);
      let d = "",
        pen = false;
      for (let i = 0; i < samples.length; i += stride) {
        const v = samples[i][s.key];
        if (v === null || !Number.isFinite(v)) {
          pen = false;
          continue;
        }
        d += (pen ? "L" : "M") + x(samples[i].t).toFixed(1) + " " + y(v).toFixed(1);
        pen = true;
      }
      return { ...s, d, min, max, x, y, t0, t1 };
    });
  }, [samples, series]);
  if (!geom) return null;
  const g0 = geom[0];
  return (
    <figure className="m-chart">
      <figcaption>
        <b>{title}</b>{" "}
        {geom.map((s) => (
          <span key={s.key} className="m-legend">
            <i style={{ background: s.color }} /> {s.label} ({fmt(s.min, 0)}…{fmt(s.max, 0)} {s.unit})
          </span>
        ))}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${SH}`}
        role="img"
        aria-label={title}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const f = (((e.clientX - rect.left) / rect.width) * W - SPAD.l) / (W - SPAD.l - SPAD.r);
          onSeek?.(g0.t0 + Math.max(0, Math.min(1, f)) * (g0.t1 - g0.t0));
        }}
      >
        <line x1={SPAD.l} x2={W - SPAD.r} y1={SH - SPAD.b} y2={SH - SPAD.b} className="m-grid" />
        {geom.map((s) => (
          <path key={s.key} d={s.d} fill="none" stroke={s.color} strokeWidth="1.8" strokeDasharray={s.dash} />
        ))}
        {Number.isFinite(t) && <line x1={g0.x(t)} x2={g0.x(t)} y1={SPAD.t} y2={SH - SPAD.b} className="m-cursor" />}
        <text x={SPAD.l} y={SH - 6} className="m-tick">{fmt(g0.t0)} с</text>
        <text x={W - SPAD.r} y={SH - 6} textAnchor="end" className="m-tick">{fmt(g0.t1)} с</text>
        <text x={6} y={14} className="m-axis">нормовано окремо для кожної кривої</text>
      </svg>
    </figure>
  );
}

/** Departure-date × TOF grid of required stage Δv. */
export function Porkchop({ transfer, onPick }) {
  const ref = useRef(null);
  const info = useMemo(() => {
    if (!transfer?.grid?.length) return null;
    let min = Infinity,
      max = -Infinity;
    for (const row of transfer.grid)
      for (const c of row)
        if (c?.dvStage) {
          min = Math.min(min, c.dvStage);
          max = Math.max(max, c.dvStage);
        }
    const cap = Math.min(max, min * 2.5);
    return { min, max, cap };
  }, [transfer]);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !info) return;
    const nD = transfer.grid.length,
      nT = transfer.tofs.length;
    cv.width = nD;
    cv.height = nT;
    const ctx = cv.getContext("2d");
    const img = ctx.createImageData(nD, nT);
    for (let i = 0; i < nD; i++)
      for (let j = 0; j < nT; j++) {
        const c = transfer.grid[i][j];
        const o = ((nT - 1 - j) * nD + i) * 4;
        if (!c?.dvStage) {
          img.data.set([40, 40, 48, 255], o);
          continue;
        }
        const f = Math.min(1, (c.dvStage - info.min) / (info.cap - info.min || 1));
        // sequential light→dark blue; beyond cap = grey
        const k = c.dvStage > info.cap ? null : f;
        img.data.set(k === null ? [90, 90, 100, 255] : [Math.round(230 - 200 * k), Math.round(240 - 170 * k), Math.round(255 - 110 * k), 255], o);
      }
    ctx.putImageData(img, 0, 0);
  }, [transfer, info]);
  if (!info) return <p className="m-muted">Немає даних сітки.</p>;
  const b = transfer.best;
  const nD = transfer.grid.length,
    nT = transfer.tofs.length;
  const bi = Math.round((b.depUtc - transfer.launchUtc) / transfer.depStepMs);
  const bj = transfer.tofs.findIndex((t) => Math.abs(t - b.tof) < 1);
  return (
    <figure className="m-chart">
      <figcaption>
        <b>Вікно старту</b>: потрібна Δv перелітного ступеня за датою відльоту (вісь X) і тривалістю (вісь Y). Світліше = менше.
        Мін. {fmt(info.min)} м/с; сірим — понад {fmt(info.cap)} м/с або без розв'язку.
      </figcaption>
      <div className="m-pork">
        <canvas
          ref={ref}
          role="img"
          aria-label={`Сітка ${nD}×${nT}; мінімум ${fmt(info.min)} м/с`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const i = Math.floor(((e.clientX - r.left) / r.width) * nD);
            const j = nT - 1 - Math.floor(((e.clientY - r.top) / r.height) * nT);
            onPick?.(i, j);
          }}
        />
        <span className="m-pork-best" style={{ left: `${((bi + 0.5) / nD) * 100}%`, top: `${((nT - 1 - bj + 0.5) / nT) * 100}%` }} title="Оптимум у сітці">
          ✕
        </span>
      </div>
      <div className="m-pork-axes">
        <span>{new Date(transfer.launchUtc).toISOString().slice(0, 10)}</span>
        <span>TOF {fmt(transfer.tofs[0] / 86400, 1)}…{fmt(transfer.tofs[nT - 1] / 86400, 1)} д</span>
        <span>{new Date(transfer.launchUtc + (nD - 1) * transfer.depStepMs).toISOString().slice(0, 10)}</span>
      </div>
    </figure>
  );
}

export function SlopeHistogram({ hist, maxSlope, label }) {
  if (!hist) return null;
  const W = 300,
    H = 110;
  const n = hist.fractions.length;
  const bw = (W - 20) / n;
  const top = Math.max(...hist.fractions, 0.01);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="m-hist" role="img" aria-label={label}>
      {hist.fractions.map((f, i) => {
        const h = (f / top) * (H - 30);
        const over = hist.bins[i] >= maxSlope;
        return (
          <g key={i}>
            <rect x={10 + i * bw} y={H - 18 - h} width={bw - 3} height={h} className={over ? "m-bar-risk" : "m-bar"} />
            <text x={10 + i * bw + bw / 2} y={H - 5} textAnchor="middle" className="m-tick">{hist.bins[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}
