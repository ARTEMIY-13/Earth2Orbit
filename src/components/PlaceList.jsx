import { useEffect, useState } from 'react';
import { PLACES } from '../data/places';
import { useLang } from '../i18n/LanguageContext';
import { formatCoords } from '../lib/geo';

export default function PlaceList({ body, selectedId, onSelect }) {
  const { lang, t } = useLang();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const items = PLACES.filter(
    p => p.body === body && (p.t[lang].name + ' ' + p.t[lang].kind).toLowerCase().includes(needle)
  );

  useEffect(() => {
    const node = selectedId && document.getElementById('item-' + selectedId);
    if (node) node.scrollIntoView({ block: 'nearest' });
  }, [selectedId, body]);

  return (
    <>
      <input
        className="search"
        placeholder={t('list.search')}
        value={q}
        onChange={e => setQ(e.target.value)}
      />
      <div className="list">
        {items.map(p => (
          <button
            key={p.id}
            id={'item-' + p.id}
            type="button"
            className={'item' + (p.id === selectedId ? ' on' : '')}
            onClick={() => onSelect(p.id)}
          >
            <b>{p.t[lang].name}</b>
            <small>
              {p.t[lang].kind} · {formatCoords(p.lat, p.lon)}
            </small>
          </button>
        ))}
        {items.length === 0 && <div className="hint">{t('list.empty')}</div>}
      </div>
    </>
  );
}
