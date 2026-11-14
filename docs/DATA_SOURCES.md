# Джерела даних — Earth2Orbit

Earth2Orbit — незалежний навчально-дослідницький проєкт для NASA Space Apps Challenge 2026, завдання
«Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars»
(<https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/>).
Він не є продуктом NASA і не є сертифікованою системою керування польотами.

## 1. Ресурси, рекомендовані завданням (вкладка Resources, перевірено 14.11.2026)

Сторінка Resources була доступна. Застереження на ній: NASA не схвалює неурядові ресурси, і учасники
мають дотримуватися умов використання кожного стороннього сайту.

| Ресурс | Призначення | Доступ / формат | Ліцензія | Покриття | Використання в Earth2Orbit |
|---|---|---|---|---|---|
| [NASA Earthdata Search](https://search.earthdata.nasa.gov/) | Пошук спостережень Землі | Веб-портал; для більшості продуктів потрібен безкоштовний Earthdata Login | Дані NASA, відкриті | Глобально | Не використано напряму: NASADEM/SRTM потребують логіна. Кандидат для майбутнього серверного адаптера |
| [NASA Worldview](https://worldview.earthdata.nasa.gov/) | Візуальний перегляд знімків | Веб, WMTS | Відкриті | Глобально | Не використано: це зображення, а не DEM |
| [NASA PDS](https://pds.nasa.gov/) | Архів планетарних місій | HTTP, PDS3/PDS4 (IMG+LBL) | Дані NASA (public domain у США) | Місяць, Марс та ін. | **Використано**: LOLA GDR, MOLA MEGDR через PDS Geosciences Node |
| [LRO у PDS Geosciences](https://pds-geosciences.wustl.edu/missions/lro/) | LOLA, Diviner, LROC, Mini-RF | HTTP, IMG із підтримкою Range | Public domain (NASA) | Місяць | **Використано**: LOLA GDR (полярний 20 м/пікс. і циліндричний 1024 пікс./°) |
| [LRO Diviner](https://pds-geosciences.wustl.edu/missions/lro/diviner.htm) | Температури, полярні продукти | HTTP, PDS | Public domain | Місяць | Ще не використано (температурні аналоги — наступний крок) |
| [CSA RCM](https://donnees-data.asc-csa.gc.ca/en/dataset/rcm) / [RADARSAT-1](https://donnees-data.asc-csa.gc.ca/en/dataset/radarsat1) | SAR Землі | Портал CSA | Відкрита ліцензія Канади | Земля | Не використано: SAR — не DEM |
| [CSA SAR tutorial](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial) | Навчання роботі з SAR | GitHub, Python | Див. репозиторій | — | Не використано |
| [Copernicus Data Space](https://dataspace.copernicus.eu/) | Sentinel, Copernicus DEM | Портал/API, потрібна реєстрація | Copernicus (вільне використання з атрибуцією) | Глобально | Не використано в цій версії: Copernicus GLO-30 потребує розбору COG/GeoTIFF |
| [ESA Open Science Catalog](https://opensciencedata.esa.int/) | Каталог наборів даних | Веб/STAC | Різні | — | Не використано |
| [JAXA G-Portal](https://gportal.jaxa.jp/) | Спостереження Землі JAXA | Портал, потрібна реєстрація | Умови JAXA | Земля | Не використано |

## 2. DEM-набори, вбудовані в застосунок (`public/dem/`)

Усі набори — невеликі вирізки (≤ 256×256 пікс., Float32, разом ≈1.6 МБ), отримані скриптом
`scripts/fetch-dem.mjs` через HTTP Range. Сирі набори не комітяться. Повна провенансна інформація
кожного набору (URL, product ID, версія, датум, CRS, роздільність, точність, ліцензія, SHA-256) — у
`public/dem/index.json`. Вона показується в UI і перевіряється тестами.

| ID | Тіло | Продукт | Роздільність | Датум | CRS | Статус |
|---|---|---|---|---|---|---|
| `moon-south-pole-lola-20m` | Місяць | LRO LOLA GDR `LDEM_875S_20M` V2.0 | 20 м/пікс. | сфера R = 1737.4 км | полярна стереографічна (сферична), planetocentric, east-positive | measured (інтерпольовано між треками) |
| `moon-apollo11-lola-30m` | Місяць | LRO LOLA GDR `LDEM_1024_00N_15N_000_030` V1.05 | 29.6 м/пікс. (1024 пікс./°) | сфера R = 1737.4 км | проста циліндрична | measured |
| `mars-jezero-mola-463m` | Марс | MGS MOLA MEGDR `MEGT44N000HB` 2.0 | 463 м/пікс. (128 пікс./°) | ареоїд (R_eq = 3396 км) | проста циліндрична, planetocentric | measured |
| `earth-*-fine` (5 ділянок) | Земля | AWS Terrain Tiles (Terrarium), z10–z12 | 31–39 м/пікс. | переважно геоїд EGM96 (залежить від джерела) | Web Mercator (EPSG:3857) | measured (композит джерел) |
| `earth-*-coarse` (5 ділянок) | Земля | AWS Terrain Tiles, z6–z8 | 500–620 м/пікс. | те саме | те саме | measured |

Земні ділянки: Атакама (Юнгай), ударна структура Гоутон, Тіманфая (Лансароте), кальдера Кілауеа і
Барринджер (Meteor Crater). Остання — новий кандидат, якого немає в каталозі.

**Ліцензії й атрибуція**
- LOLA, MOLA: архівні дані NASA PDS, public domain у США. Цитувати: Smith et al. (LOLA team);
  Smith et al. 2003 (MOLA MEGDR).
- Terrain Tiles: AWS Open Data Registry (Tilezen/Mapzen Joerd). Атрибуція за списком джерел:
  <https://github.com/tilezen/joerd/blob/master/docs/attribution.md> (SRTM/NASA, ArcticDEM, GMTED,
  ETOPO1, 3DEP та ін.).

**Відомі особливості**
- Terrarium містить батиметрію і не має маски суходолу/води. Ми **припускаємо**, що висоти < 0 м — це
  море, і перетворюємо їх на nodata. Припущення позначене в метаданих і UI. Для западин нижче рівня
  моря (Долина Смерті, Мертве море) воно хибне: такі ділянки отримують статус «недостатньо даних».
- Крок пікселя тайла ≠ роздільність джерела: тайли z12 можуть бути передискретизованими з SRTM 30 м
  або GMTED 250 м. Деталей це не додає.
- Вирізки Місяця й Марса покривають лише околиці точок каталогу. UI показує відстань від опорної точки
  каталогу. Наприклад, вирізка Apollo 11 лежить за 337 км від точки «Море Спокою».

## 3. Ефемериди та час

| Джерело | Призначення | Як використано |
|---|---|---|
| [JPL Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html), табл. 1 (1800–2050) | Геліоцентричні EMB і Марс | Вбудовано (працює й на Pages) |
| Montenbruck & Gill, *Satellite Orbits* (2000), §3.3.2 | Низькоточна геоцентрична орбіта Місяця | Вбудовано |
| [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) (DE441) | Еталонні вектори | Тестова фікстура `server/data/fixtures/horizons-vectors.json` (`npm run fetch:horizons-fixture`). Node-маршрут `/api/horizons` — для звірки в UI |
| [NAIF SPICE](https://naif.jpl.nasa.gov/) | Геометрія знімання, кернели | **Не використано.** Геометрія знімання стосується окремих знімків, а не DEM-гридів. У UI вона позначена як «недоступно» |
| IERS Bulletin C | Стрибкові секунди (TAI−UTC = 37 с з 2017-01-01) | Таблиця в `shared/mission/time.js`. Майбутні стрибкові секунди невідомі, тому вважаємо, що їх немає |

Звірка в тестах: Земля < 20 000 км (≈0.007 %), Марс < 80 000 км (≈0.02 %), Місяць < 500 км (≈0.04 %).

## 4. Досліджено, але не підключено

- **NASADEM / SRTM (LP DAAC)** — потрібен Earthdata Login. Для Node-версії можна додати серверний
  адаптер із секретом лише на сервері.
- **Copernicus GLO-30 (AWS `copernicus-dem-30m`)** — відкритий COG. Потрібен розбір GeoTIFF/COG.
- **HRSC / HiRISE DTM (Марс)** — HiRISE DTM існують лише для окремих стереопар (≈1 м/пікс., кілька
  км²), тому не можуть покрити всю планету. Розглядати як локальні адаптери з документованою
  точністю.
- **LOLA PGDA product 78 (окремі південнополярні ділянки 5 м)** — в цій версії використано
  `LDEM_875S_20M` із PDS. Локальну 5 м деталізацію не поширюємо на інші райони.
- **NASA POWER** — уже використовується в каталозі для кліматичних норм. Це не прогноз погоди для
  старту.
