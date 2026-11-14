import { forwardRef, useState } from 'react';
import { linksFor } from '../data/places';
import { useLang } from '../i18n/LanguageContext';
import { formatCoords } from '../lib/geo';

function Thumb({ place }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={'thumb thumb-fallback ' + place.body} aria-hidden="true" />;
  return <img className="thumb" src={place.image} alt="" onError={() => setFailed(true)} />;
}

/* Card that follows the marker on the map. Position is written to the root node
   by MapView on every map move, so React does not re-render per frame.
   className must stay constant: MapView toggles 'flip'/'behind' on this node via classList. */
const PlacePopup = forwardRef(function PlacePopup({ place, ready, onClose, onSelect }, ref) {
  const { lang, t } = useLang();
  const { forward, reverse } = linksFor(place.id);
  const link = forward[0] || reverse[0];
  const label = forward[0] ? t('popup.analog') : t('popup.analogFor');
  const text = place.t[lang];

  return (
    <div ref={ref} className="popup-anchor" data-ready={ready}>
      <span className="popup-line" />
      <div className="popup-card" role="dialog" aria-label={text.name}>
        <button type="button" className="popup-close" aria-label={t('popup.close')} onClick={onClose}>
          ✕
        </button>
        <div className="popup-top">
          {/* key: reset the failed-image state when another place is selected */}
          <Thumb key={place.id} place={place} />
          <div className="popup-text">
            <h3>{text.name}</h3>
            <div className="popup-coords">{formatCoords(place.lat, place.lon)}</div>
            <p>{text.summary}</p>
          </div>
        </div>
        {link && (
          <button type="button" className="popup-link" onClick={() => onSelect(link.id)}>
            <span className="popup-globe" aria-hidden="true">
              ◍
            </span>
            <span className="popup-link-text">
              <small>{label}</small>
              <b>{link.place.t[lang].name}</b>
            </span>
            <span className="popup-chevron" aria-hidden="true">
              ›
            </span>
          </button>
        )}
      </div>
    </div>
  );
});

export default PlacePopup;
