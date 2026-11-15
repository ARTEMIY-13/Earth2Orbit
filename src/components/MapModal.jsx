import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Modal from "./Modal.jsx";
import { useLang } from "../i18n/LanguageContext.jsx";
export default function MapModal({
  sites,
  selected,
  onSelect,
  onPick,
  onClose,
}) {
  const { tr } = useLang();
  const container = useRef(null),
    map = useRef(null),
    markers = useRef([]);
  const [status, setStatus] = useState(tr("Завантаження карти…"));
  useEffect(() => {
    let active = true,
      loaded = 0,
      failed = 0;
    const instance = L.map(container.current, {
      minZoom: 2,
      maxZoom: 15,
      worldCopyJump: true,
    }).setView(
      selected ? [selected.lat, selected.lon] : [20, 0],
      selected ? 7 : 2,
    );
    map.current = instance;
    const layer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
    ).addTo(instance);
    layer.on("loading", () => {
      loaded = 0;
      failed = 0;
      if (active) setStatus(tr("Завантаження карти…"));
    });
    layer.on("tileload", () => loaded++);
    layer.on("tileerror", () => failed++);
    layer.on("load", () => {
      if (active)
        setStatus(
          loaded > 0
            ? failed
              ? tr("Частина тайлів недоступна. Зміни масштаб.")
              : ""
            : tr("Карта недоступна. Перевір з’єднання."),
        );
    });
    markers.current = sites.map((site) => {
      const marker = L.circleMarker([site.lat, site.lon], {
        radius: 7,
        color: "#0b6953",
        weight: 2,
        fillColor: site.science?.status === "reference" ? "#88e2c1" : "#e8bd87",
        fillOpacity: 1,
      }).addTo(instance);
      const content = document.createElement("div"),
        name = document.createElement("b"),
        text = document.createElement("p"),
        button = document.createElement("button");
      name.textContent = site.name;
      text.textContent = site.science?.summary || site.description;
      button.textContent = tr("Переглянути локацію →");
      button.onclick = () => onSelect(site.index);
      content.append(name, text, button);
      marker.bindPopup(content);
      return marker;
    });
    if (onPick)
      instance.on("click", (event) =>
        onPick({
          lat: event.latlng.lat.toFixed(5),
          lon: event.latlng.lng.toFixed(5),
        }),
      );
    const frame = requestAnimationFrame(() => {
      instance.invalidateSize();
      if (selected) markers.current[selected.index]?.openPopup();
    });
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      instance.remove();
      map.current = null;
    };
  }, [onPick, onSelect, selected, sites, tr]);
  function focus(site) {
    map.current?.setView([site.lat, site.lon], 7);
    markers.current[site.index]?.openPopup();
  }
  return (
    <Modal
      title={
        onPick
          ? tr("Обери точку для нової кандидатури")
          : selected?.name || tr("Карта земних аналогів")
      }
      eyebrow={tr("ЗЕМЛЯ · OPENSTREETMAP")}
      className="map-modal"
      onClose={onClose}
    >
      <div className="map-layout">
        <div className="map-list">
          {onPick && (
            <p className="mini-note">
              {tr("Натисни на будь-яку точку карти. Координати потраплять до форми.")}
            </p>
          )}
          <button onClick={() => map.current?.setView([20, 0], 2)}>
            ◎ {tr("Усі локації")}
          </button>
          {sites.map((site) => (
            <button key={site.id} onClick={() => focus(site)}>
              {site.name}
            </button>
          ))}
        </div>
        <div className="map-area">
          <div id="realmap" ref={container} />
          {status && (
            <div id="mapStatus" role="status">
              {status}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
