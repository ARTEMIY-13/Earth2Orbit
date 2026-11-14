import { useEffect, useState } from "react";
import { asset } from "../lib/api";
import { useLang } from "../i18n/LanguageContext.jsx";
export default function Gallery({ photos }) {
  const { tr } = useLang();
  const [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [loaded, setLoaded] = useState(false),
    [failed, setFailed] = useState(false);
  const photo = photos[index];
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [photo?.url]);
  useEffect(() => {
    if (paused || photos.length < 2) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((value) => (value + 1) % photos.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [paused, photos.length]);
  if (!photo) return null;
  const move = (step) =>
    setIndex((value) => (value + step + photos.length) % photos.length);
  return (
    <>
      <div className="gallery">
        {(!loaded || failed) && (
          <div className="gallery-loading">
            {failed ? tr("Знімок зараз недоступний") : tr("Завантаження знімка…")}
          </div>
        )}
        <img
          src={asset(photo.url)}
          alt={photo.title}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ opacity: loaded && !failed ? 1 : 0 }}
        />
        <div className="gallery-buttons">
          <button aria-label={tr("Попередній знімок")} onClick={() => move(-1)}>
            ‹
          </button>
          <span className="gallery-count">
            {index + 1} / {photos.length}
          </span>
          <button
            aria-label={paused ? tr("Продовжити слайдшоу") : tr("Призупинити слайдшоу")}
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? "▶" : "II"}
          </button>
          <button aria-label={tr("Наступний знімок")} onClick={() => move(1)}>
            ›
          </button>
        </div>
      </div>
      <div className="gallery-dots">
        {photos.map((_, i) => (
          <button
            key={i}
            className={i === index ? "active" : ""}
            onClick={() => setIndex(i)}
            aria-label={tr("Знімок") + " " + (i + 1)}
          />
        ))}
      </div>
      <div className="photo-caption">
        {photo.title} · {photo.credit}{" "}
        <a href={photo.source} target="_blank" rel="noopener noreferrer">
          {tr("Джерело")} →
        </a>
      </div>
    </>
  );
}
