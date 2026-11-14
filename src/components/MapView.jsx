import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BASEMAPS, BODY_COLORS } from '../config/basemaps';
import { BY_ID, PLACES_GEOJSON, linksFor } from '../data/places';
import { useLang } from '../i18n/LanguageContext';
import { angularDistance, graticule } from '../lib/geo';
import PlacePopup from './PlacePopup';

import maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?url';


maplibregl.workerUrl = workerUrl;

const DEFAULT_VIEW = { center: [0, 10], zoom: 1.4 };
const TARGET_ZOOM = 3.2;
const ZOOM_OUT_MS = 700; // first phase when the target is on another body

function applyBasemap(map, body) {
  map.setPaintProperty('bg', 'background-color', BASEMAPS[body].bg);
  Object.keys(BASEMAPS).forEach(k => {
    if (map.getLayer('tiles-' + k)) map.setLayoutProperty('tiles-' + k, 'visibility', k === body ? 'visible' : 'none');
  });
  map.setFilter('places', ['==', ['get', 'body'], body]);
}

export default function MapView({ body, selectedId, popupOpen, onSelect, onClosePopup }) {
  const { t } = useLang();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const shownBodyRef = useRef(null); // body whose basemap is currently on the map
  const animToken = useRef(0); // invalidates callbacks of interrupted animations
  const timerRef = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [flying, setFlying] = useState(false);

  /* ---------- Map creation ---------- */
  useEffect(() => {
    const sources = {
      places: { type: 'geojson', data: PLACES_GEOJSON, promoteId: 'id' },
      grid: { type: 'geojson', data: graticule() }
    };
    const layers = [{ id: 'bg', type: 'background', paint: { 'background-color': BASEMAPS.earth.bg } }];
    Object.entries(BASEMAPS).forEach(([key, b]) => {
      sources['tiles-' + key] = {
        type: 'raster',
        tiles: b.tiles,
        tileSize: 256,
        maxzoom: b.maxzoom,
        attribution: b.attribution
      };
      layers.push({ id: 'tiles-' + key, type: 'raster', source: 'tiles-' + key, layout: { visibility: 'none' } });
    });
    layers.push({
      id: 'grid',
      type: 'line',
      source: 'grid',
      paint: { 'line-color': '#ffffff', 'line-opacity': 0.12, 'line-width': 1 }
    });
    layers.push({
      id: 'places',
      type: 'circle',
      source: 'places',
      paint: {
        'circle-radius': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], 11,
          ['boolean', ['feature-state', 'related'], false], 9,
          6
        ],
        'circle-color': [
          'match', ['get', 'body'],
          'earth', BODY_COLORS.earth,
          'moon', BODY_COLORS.moon,
          'mars', BODY_COLORS.mars,
          '#fff'
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': [
          'case',
          ['boolean', ['feature-state', 'selected'], false], '#ffffff',
          ['boolean', ['feature-state', 'related'], false], '#ffd54f',
          '#111'
        ]
      }
    });

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: { version: 8, projection: { type: 'globe' }, sources, layers },
      center: DEFAULT_VIEW.center,
      zoom: DEFAULT_VIEW.zoom
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      map.on('click', 'places', e => onSelectRef.current(e.features[0].properties.id));
      map.on('mouseenter', 'places', () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', 'places', () => (map.getCanvas().style.cursor = ''));
      mapRef.current = map;
      setLoaded(true);
    });

    return () => {
      clearTimeout(timerRef.current);
      animToken.current++;
      shownBodyRef.current = null;
      mapRef.current = null;
      setLoaded(false);
      map.remove();
    };
  }, []);

  /* ---------- Body switch, highlighting and animated transitions ---------- */
  useEffect(() => {
    if (!loaded) return;
    const map = mapRef.current;
    const token = ++animToken.current;
    const alive = () => token === animToken.current;
    clearTimeout(timerRef.current);
    setFlying(false);

    // Highlight the selected place and its analogs
    map.removeFeatureState({ source: 'places' });
    const place = selectedId ? BY_ID[selectedId] : null;
    if (place) {
      map.setFeatureState({ source: 'places', id: place.id }, { selected: true });
      const { forward, reverse } = linksFor(place.id);
      [...forward, ...reverse].forEach(l => map.setFeatureState({ source: 'places', id: l.id }, { related: true }));
    }

    // Smooth flight from the current view to the selected point
    const fly = () => {
      const c = map.getCenter();
      const dist = angularDistance(c.lng, c.lat, place.lon, place.lat);
      const nearby = dist < 1 && Math.abs(map.getZoom() - TARGET_ZOOM) < 0.3;
      const duration = nearby ? 600 : Math.min(3800, Math.max(1600, 1300 + dist * 20));
      const wide = map.getContainer().clientWidth > 760;

      setFlying(true);
      map.flyTo({
        center: [place.lon, place.lat],
        zoom: TARGET_ZOOM,
        duration,
        curve: 1.6, // how strongly the camera zooms out mid-flight
        offset: wide ? [-150, 0] : [0, 0], // leave room for the popup on the right
        essential: true
      });

      const finish = () => {
        if (!alive()) return;
        clearTimeout(timerRef.current);
        setFlying(false);
      };
      map.once('moveend', finish);
      timerRef.current = setTimeout(finish, duration + 500); // safety net
    };

    const bodyChanged = shownBodyRef.current !== body;

    if (!bodyChanged) {
      if (place) fly();
      return;
    }

    // First render: set the basemap without animation
    if (shownBodyRef.current === null) {
      applyBasemap(map, body);
      shownBodyRef.current = body;
      if (place) fly();
      return;
    }

    // Another body: zoom out, swap the basemap, then fly to the target (or reset the view)
    map.stop();
    if (place) setFlying(true);
    map.easeTo({ zoom: Math.min(map.getZoom(), DEFAULT_VIEW.zoom), duration: ZOOM_OUT_MS, essential: true });
    map.once('moveend', () => {
      if (!alive()) return;
      applyBasemap(map, body);
      shownBodyRef.current = body;
      if (place) fly();
      else map.easeTo({ ...DEFAULT_VIEW, duration: 800, essential: true });
    });
    timerRef.current = setTimeout(() => {
      // safety net if 'moveend' never arrives
      if (alive() && shownBodyRef.current !== body) {
        applyBasemap(map, body);
        shownBodyRef.current = body;
        if (place) fly();
      }
    }, ZOOM_OUT_MS + 500);

    return () => clearTimeout(timerRef.current);
  }, [loaded, body, selectedId]);

  /* ---------- Popup follows the marker ---------- */
  const popupPlace = popupOpen && selectedId ? BY_ID[selectedId] : null;
  useLayoutEffect(() => {
    if (!loaded || !popupPlace) return;
    const map = mapRef.current;
    const update = () => {
      const node = popupRef.current;
      if (!node) return;
      const pt = map.project([popupPlace.lon, popupPlace.lat]);
      const c = map.getCenter();
      // On the far side of the globe the marker is hidden, so hide the card too
      const behind = map.getZoom() < 6 && angularDistance(c.lng, c.lat, popupPlace.lon, popupPlace.lat) > 80;
      node.style.transform = `translate(${pt.x}px, ${pt.y}px)`;
      node.classList.toggle('behind', behind);
      node.classList.toggle('flip', pt.x > map.getContainer().clientWidth - 420);
    };
    update();
    map.on('move', update);
    map.on('resize', update);
    return () => {
      map.off('move', update);
      map.off('resize', update);
    };
  }, [loaded, popupPlace]);

  const missing = !BASEMAPS[body].tiles;
  return (
    <div className="mapwrap">
      <div id="map" ref={containerRef} />
      {missing && <div className="note">{t('map.missing', { body: t('body.' + body) })}</div>}
      {loaded && popupPlace && (
        <PlacePopup
          ref={popupRef}
          place={popupPlace}
          ready={!flying}
          onClose={onClosePopup}
          onSelect={onSelect}
        />
      )}
    </div>
  );
}
