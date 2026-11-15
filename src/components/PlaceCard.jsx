import { BY_ID, linksFor } from '../data/places';
import { useLang } from '../i18n/LanguageContext';
import { formatCoords } from '../lib/geo';

function Chips({ list, onSelect }) {
  const { lang, t } = useLang();
  return list.map(l => (
    <button key={l.id} type="button" className="chip" onClick={() => onSelect(l.id)}>
      {l.place.t[lang].name}
      <span>
        {t('body.' + l.place.body)} · {l.aspect[lang]}
      </span>
    </button>
  ));
}

export default function PlaceCard({ id, onSelect }) {
  const { lang, t } = useLang();
  if (!id) return <div className="card hint">{t('card.hint')}</div>;

  const p = BY_ID[id];
  const { forward, reverse } = linksFor(id);
  return (
    <div className="card">
      <h2>{p.t[lang].name}</h2>
      <div className="meta">
        {t('body.' + p.body)} · {p.t[lang].kind} · {formatCoords(p.lat, p.lon)}
      </div>
      <div>{p.t[lang].summary}</div>
      {forward.length > 0 && (
        <>
          <h3>{t('card.analogs')}</h3>
          <Chips list={forward} onSelect={onSelect} />
        </>
      )}
      {reverse.length > 0 && (
        <>
          <h3>{t('card.analogFor')}</h3>
          <Chips list={reverse} onSelect={onSelect} />
        </>
      )}
    </div>
  );
}
