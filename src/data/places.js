/* Demo data: coordinates are approximate, verify and add sources.
   Texts live per language (uk / en); everything else is language-neutral.
   Popup thumbnails: public/images/<id>.jpg (a placeholder is shown if missing). */
const P = (id, body, lat, lon, uk, en, analogs = []) => ({
  id,
  body,
  lat,
  lon,
  image: `${import.meta.env.BASE_URL}images/${id}.jpg`,
  t: {
    uk: { name: uk[0], kind: uk[1], summary: uk[2] },
    en: { name: en[0], kind: en[1], summary: en[2] }
  },
  analogs: analogs.map(([aid, ukAspect, enAspect]) => ({ id: aid, aspect: { uk: ukAspect, en: enAspect } }))
});

export const PLACES = [
  // Moon
  P('shackleton', 'moon', -89.9, 0,
    ['Кратер Шеклтон', 'Полярний кратер', 'Кратер біля південного полюса Місяця з постійно затіненими ділянками, де можливий водяний лід. Один із головних кандидатів для майбутньої бази.'],
    ['Shackleton Crater', 'Polar crater', 'A crater near the Moon’s south pole with permanently shadowed areas where water ice may exist. One of the main candidates for a future base.'],
    [['dry-valleys', 'холод і лід у мерзлоті', 'cold and ground ice in permafrost'], ['haughton', 'полярний ударний кратер', 'polar impact crater']]),
  P('malapert', 'moon', -85.99, 0.12,
    ['Гора Малаперт', 'Гора біля полюса', 'Узвишшя біля південного полюса з доброю освітленістю та прямою видимістю Землі, зручне для зв’язку й енергії.'],
    ['Malapert Mountain', 'Mountain near the pole', 'A highland near the south pole with good illumination and a direct line of sight to Earth, convenient for communications and power.'],
    [['mauna-kea', 'вулканічний реголіт і гірський рельєф', 'volcanic regolith and mountain terrain']]),
  P('marius', 'moon', 14.09, -56.77,
    ['Яма в Маріус-Гіллз', 'Лавова труба', 'Провал, що веде до імовірної лавової труби. Такі порожнини можуть захищати базу від радіації та перепадів температури.'],
    ['Marius Hills Pit', 'Lava tube', 'A collapse pit leading to a probable lava tube. Such cavities could shield a base from radiation and temperature swings.'],
    [['lanzarote', 'лавові труби', 'lava tubes'], ['askja', 'вулканічний рельєф', 'volcanic terrain']]),
  // Mars
  P('jezero', 'mars', 18.38, 77.58,
    ['Кратер Єзеро', 'Давня дельта', 'Кратер із давньою річковою дельтою, місце роботи марсохода Perseverance. Цікавий для пошуку слідів життя.'],
    ['Jezero Crater', 'Ancient delta', 'A crater with an ancient river delta, the work site of the Perseverance rover. Of interest in the search for traces of life.'],
    [['atacama', 'гіперсуха пустеля, пошук життя', 'hyper-arid desert, search for life'], ['rio-tinto', 'сліди води та кисле середовище', 'traces of water and an acidic environment']]),
  P('gale', 'mars', -5.4, 137.8,
    ['Кратер Гейла', 'Шаруваті породи', 'Кратер із центральною горою Шарп, де шаруваті осадові породи зберігають історію клімату. Тут працює марсохід Curiosity.'],
    ['Gale Crater', 'Layered rocks', 'A crater with the central mound Mount Sharp, where layered sedimentary rocks preserve climate history. The Curiosity rover works here.'],
    [['death-valley', 'сухий шаруватий рельєф', 'dry layered terrain'], ['mdrs', 'польові випробування техніки та екіпажів', 'field tests of equipment and crews']]),
  P('utopia', 'mars', 46.7, 117.5,
    ['Рівнина Утопія', 'Підповерхневий лід', 'Широка північна рівнина з покладами підповерхневого льоду, який можна використати як ресурс для майбутньої бази.'],
    ['Utopia Planitia', 'Subsurface ice', 'A broad northern plain with deposits of subsurface ice that could be used as a resource for a future base.'],
    [['haughton', 'арктична мерзлота і лід', 'Arctic permafrost and ice'], ['dry-valleys', 'холодна пустеля з льодом під ґрунтом', 'cold desert with ice under the soil']]),
  // Earth
  P('atacama', 'earth', -24.5, -69.25,
    ['Пустеля Атакама', 'Гіперсуха пустеля', 'Одна з найсухіших пустель світу. Її ґрунти використовують як аналог марсіанських, тут випробовують прилади для пошуку життя.'],
    ['Atacama Desert', 'Hyper-arid desert', 'One of the driest deserts on Earth. Its soils are used as a Martian analog, and life-detection instruments are tested here.']),
  P('haughton', 'earth', 75.38, -89.68,
    ['Кратер Хотон', 'Ударний кратер, Арктика', 'Ударний кратер на острові Девон у канадській Арктиці. Тут працює проєкт Haughton-Mars, де тестують техніку та роботу екіпажів.'],
    ['Haughton Crater', 'Impact crater, Arctic', 'An impact crater on Devon Island in the Canadian Arctic. The Haughton-Mars Project tests equipment and crew operations here.']),
  P('death-valley', 'earth', 36.5, -117.1,
    ['Долина Смерті', 'Спекотна пустеля', 'Кам’яниста пустеля з різким рельєфом і шаруватими породами. Підходить для випробувань всюдиходів і як візуальний аналог марсіанських ландшафтів.'],
    ['Death Valley', 'Hot desert', 'A rocky desert with sharp relief and layered rocks. Suitable for rover testing and as a visual analog of Martian landscapes.']),
  P('mauna-kea', 'earth', 19.82, -155.47,
    ['Мауна-Кеа', 'Вулкан, Гаваї', 'Схили вулкана з вулканічним ґрунтом, який застосовують для місячних симулянтів реголіту та тестів видобутку ресурсів на місці.'],
    ['Mauna Kea', 'Volcano, Hawaii', 'Volcano slopes with volcanic soil used for lunar regolith simulants and in-situ resource extraction tests.']),
  P('askja', 'earth', 65.03, -16.75,
    ['Аскья (Ісландія)', 'Вулканічна кальдера', 'Вулканічна кальдера в Ісландії. У 1960-х тут тренувалися астронавти програми Apollo.'],
    ['Askja (Iceland)', 'Volcanic caldera', 'A volcanic caldera in Iceland. Apollo astronauts trained here in the 1960s.']),
  P('dry-valleys', 'earth', -77.5, 162.0,
    ['Сухі долини Антарктиди', 'Холодна пустеля', 'Крижана пустеля в Антарктиді майже без снігового покриву. Вважається аналогом марсіанської мерзлоти та холодних умов.'],
    ['Antarctic Dry Valleys', 'Cold desert', 'An icy desert in Antarctica with almost no snow cover. Considered an analog of Martian permafrost and cold conditions.']),
  P('lanzarote', 'earth', 29.158, -13.439,
    ['Куева-де-лос-Вердес (Лансароте)', 'Лавова труба', 'Лавова труба на Канарських островах. Допомагає вивчати, як виглядають і поводяться такі порожнини, можливі на Місяці та Марсі.'],
    ['Cueva de los Verdes (Lanzarote)', 'Lava tube', 'A lava tube in the Canary Islands. Helps study how such cavities look and behave, which may exist on the Moon and Mars.']),
  P('rio-tinto', 'earth', 37.72, -6.55,
    ['Ріо-Тінто (Іспанія)', 'Кисла річка', 'Річка з дуже кислою водою та мінералами заліза. Її вивчають як аналог марсіанських умов, де могло існувати життя.'],
    ['Rio Tinto (Spain)', 'Acidic river', 'A river with highly acidic water and iron minerals. Studied as an analog of Martian conditions where life may have existed.']),
  P('mdrs', 'earth', 38.406, -110.792,
    ['Mars Desert Research Station', 'Станція в пустелі, Юта', 'Дослідницька станція в пустелі штату Юта, де екіпажі відпрацьовують життя й роботу в умовах, що імітують марсіанську базу.'],
    ['Mars Desert Research Station', 'Desert station, Utah', 'A research station in the Utah desert where crews rehearse living and working in conditions that mimic a Martian base.'])
];

export const BY_ID = Object.fromEntries(PLACES.map(p => [p.id, p]));

export const PLACES_GEOJSON = {
  type: 'FeatureCollection',
  features: PLACES.map(p => ({
    type: 'Feature',
    properties: { id: p.id, body: p.body },
    geometry: { type: 'Point', coordinates: [p.lon, p.lat] }
  }))
};

/** Forward analogs (listed on the place) and reverse ones (places that list this one). */
export function linksFor(id) {
  const p = BY_ID[id];
  const forward = p.analogs.map(a => ({ ...a, place: BY_ID[a.id] }));
  const reverse = PLACES.flatMap(q =>
    q.analogs.filter(a => a.id === id).map(a => ({ id: q.id, aspect: a.aspect, place: q }))
  );
  return { forward, reverse };
}
