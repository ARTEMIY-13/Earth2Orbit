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
| [NASA Earthdata Search](https://search.earthdata.nasa.gov/) | Пошук спостережень Землі | Веб-портал; для більшості продуктів потрібен безкоштовний Earthdata Login | Дані NASA, відкриті | Глобально | Напряму не використано (потрібен Earthdata Login). Той самий продукт NASADEM беремо з публічного дзеркала Microsoft Planetary Computer |
| [NASA Worldview](https://worldview.earthdata.nasa.gov/) | Візуальний перегляд знімків | Веб, WMTS | Відкриті | Глобально | Не використано: це зображення, а не DEM |
| [NASA PDS](https://pds.nasa.gov/) | Архів планетарних місій | HTTP, PDS3/PDS4 (IMG+LBL) | Дані NASA (public domain у США) | Місяць, Марс та ін. | **Використано**: LOLA GDR, MOLA MEGDR через PDS Geosciences Node |
| [LRO у PDS Geosciences](https://pds-geosciences.wustl.edu/missions/lro/) | LOLA, Diviner, LROC, Mini-RF | HTTP, IMG із підтримкою Range | Public domain (NASA) | Місяць | **Використано**: LOLA GDR (полярний 20 м/пікс. і циліндричний 1024 пікс./°) |
| [LRO Diviner](https://pds-geosciences.wustl.edu/missions/lro/diviner.htm) | Температури, полярні продукти | HTTP, PDS | Public domain | Місяць | Ще не використано (температурні аналоги — наступний крок) |
| [CSA RCM](https://donnees-data.asc-csa.gc.ca/en/dataset/rcm) / [RADARSAT-1](https://donnees-data.asc-csa.gc.ca/en/dataset/radarsat1) | SAR Землі | Портал CSA | Відкрита ліцензія Канади | Земля | Не використано: SAR — не DEM |
| [CSA SAR tutorial](https://github.com/asc-csa/Synthetic_Aperture_Radar_Tutorial) | Навчання роботі з SAR | GitHub, Python | Див. репозиторій | — | Не використано |
| [Copernicus Data Space](https://dataspace.copernicus.eu/) | Sentinel, Copernicus DEM | Портал/API, потрібна реєстрація | Copernicus (вільне використання з атрибуцією) | Глобально | **Використано**: Copernicus DEM GLO-30 (публічні COG на AWS), читаються власним COG-рідером. ESA WorldCover — маска води |
| [ESA Open Science Catalog](https://opensciencedata.esa.int/) | Каталог наборів даних | Веб/STAC | Різні | — | Не використано |
| [JAXA G-Portal](https://gportal.jaxa.jp/) | Спостереження Землі JAXA | Портал, потрібна реєстрація | Умови JAXA | Земля | Не використано |

## 2. DEM-набори, вбудовані в застосунок (`public/dem/`)

Усі набори — невеликі вирізки (≤ 256×256 пікс., Float32, разом ≈1.7 МБ), отримані скриптом
`scripts/fetch-dem.mjs` через HTTP Range. Сирі набори не комітяться. Повна провенансна інформація
кожного набору (URL, product ID, версія, датум, CRS, роздільність, точність, ліцензія, маска, SHA-256) —
у `public/dem/index.json` (мовно-нейтральна, англійською). Вона показується в UI і перевіряється
тестами.

| ID | Тіло | Продукт | Роздільність | Датум | CRS | Статус |
|---|---|---|---|---|---|---|
| `moon-south-pole-lola-20m` | Місяць | LRO LOLA GDR `LDEM_875S_20M` V2.0 | 20 м/пікс. | сфера R = 1737.4 км | полярна стереографічна (сферична), planetocentric, east-positive | measured (інтерпольовано між треками) |
| `moon-apollo11-lola-30m` | Місяць | LRO LOLA GDR `LDEM_1024_00N_15N_000_030` V1.05 | 29.6 м/пікс. | сфера R = 1737.4 км | проста циліндрична | measured |
| `mars-jezero-mola-463m` | Марс | MGS MOLA MEGDR `MEGT44N000HB` 2.0 | 463 м/пікс. | ареоїд (R_eq = 3396 км) | проста циліндрична, planetocentric | measured |
| `earth-*-fine` (6 ділянок) | Земля | Copernicus DEM GLO-30 (COG, AWS) | 27–30 м/пікс. | геоїд EGM2008 | географічна lat/lon, WGS84 (EPSG:4326), PixelIsPoint | measured (DSM) |
| `earth-*-coarse` (6 ділянок) | Земля | Copernicus DEM GLO-30, блочне усереднення 15×15 | 400–450 м/пікс. | EGM2008 | те саме | measured, derived (усереднення) |
| `earth-meteor-crater-nasadem-fine` | Земля | NASADEM HGT v001 (COG, Planetary Computer) | 28 м/пікс. | геоїд EGM96 | те саме | measured (для порівняння джерел) |

Земні ділянки: Атакама (Юнгай), ударна структура Гоутон, Тіманфая (Лансароте), кальдера Кілауеа,
Барринджер (Meteor Crater, новий кандидат) і **Badwater Basin у Долині Смерті (−86 м, нижче рівня моря)**.

**Маска води.** ESA WorldCover 2021 v200 (10 м, CC BY 4.0): піксель DEM позначається nodata, якщо клас 80
(постійні водойми) займає ≥ 50 % його підвибірок (3×3). Висоти нижче 0 м **не** відкидаються:
Долина Смерті зберігає −86 м. Для грубих вікон використовується overview-рівень WorldCover (≈37 м).
Де WorldCover відсутній, маска позначається як невідома.

**Ліцензії й атрибуція**
- LOLA, MOLA: архівні дані NASA PDS (public domain у США). Цитувати: Smith et al. (LOLA team);
  Smith et al. 2003 (MOLA MEGDR).
- Copernicus DEM GLO-30: «produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and
  Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved».
- NASADEM: NASA JPL (2020), NASADEM Merged DEM Global 1 arc second V001, NASA EOSDIS LP DAAC,
  doi:10.5067/MEaSUREs/NASADEM/NASADEM_HGT.001 (доступ через Microsoft Planetary Computer: анонімний
  SAS-токен, без секретів).
- ESA WorldCover: CC BY 4.0 — © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021).

**Особливості**
- Copernicus GLO-30 — це DSM (поверхня з будівлями й рослинністю), а не «голий ґрунт».
- Вирізки Місяця й Марса покривають лише околиці точок каталогу. UI показує відстань від опорної
  точки (наприклад, вирізка Apollo 11 лежить за 337 км від точки «Море Спокою»).

## 2a. Геометрія знімання (PDS Orbital Data Explorer)

| Джерело | Що беремо | Доступ |
|---|---|---|
| [PDS ODE REST](https://oderest.rsl.wustl.edu/) — LRO LROC NAC CDR (`CDRNAC4`), MRO HiRISE RDR (`RDRV11`) | Emission, incidence, phase, роздільність, UTC, контур знімка | Браузер напряму (ODE віддає `Access-Control-Allow-Origin: *`), тож працює й на GitHub Pages |
| Індексний запис LROC (`INDEX.LBL`: `SPACECRAFT_ALTITUDE`, `TARGET_CENTER_DISTANCE`) | Висота апарата над поверхнею | Відлунюється в ODE; перевіряється умовою altitude + R ≈ center distance |
| HiRISE / LROC NAC DTM у ODE | Список високороздільних DTM над точкою | Лише список із посиланнями; автоматично не завантажуються |

Для HiRISE висоти апарата немає ні в ODE, ні в етикетці RDR. Її показано як «недоступно» з поясненням,
що для обчислення потрібні SPICE-кернели MRO (не підключені).

## 3. Ефемериди та час

| Джерело | Призначення | Як використано |
|---|---|---|
| [JPL Approximate Positions of the Planets](https://ssd.jpl.nasa.gov/planets/approx_pos.html), табл. 1 (1800–2050) | Геліоцентричні EMB і Марс | Вбудовано (працює й на Pages) |
| Montenbruck & Gill, *Satellite Orbits* (2000), §3.3.2 | Низькоточна геоцентрична орбіта Місяця | Вбудовано |
| [JPL Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) (DE441) | Еталонні вектори | Тестова фікстура `server/data/fixtures/horizons-vectors.json` (`npm run fetch:horizons-fixture`). Node-маршрут `/api/horizons` — для звірки в UI |
| [NAIF SPICE](https://naif.jpl.nasa.gov/) | Геометрія знімання з кернелів | Не підключено: геометрію беремо з опублікованих метаданих продуктів PDS (розділ 2a). Там, де їх немає (висота HiRISE), UI пише «недоступно» |
| IERS Bulletin C | Стрибкові секунди (TAI−UTC = 37 с з 2017-01-01) | Таблиця в `shared/mission/time.js`. Майбутні стрибкові секунди невідомі, тому вважаємо, що їх немає |

Звірка в тестах: Земля < 20 000 км (≈0.007 %), Марс < 80 000 км (≈0.02 %), Місяць < 500 км (≈0.04 %).

## 4. Досліджено, але не підключено

- **AWS Terrain Tiles (Terrarium)** використовувались у першій версії. Їх замінено на Copernicus GLO-30 і
  NASADEM через відсутність маски води та змішані джерела.
- **HiRISE / LROC NAC DTM** — знаходяться через ODE, але автоматично не завантажуються (покривають лише
  окремі ділянки; потрібен розбір PDS-форматів конкретних продуктів).
- **NASA POWER** — уже використовується в каталозі для кліматичних норм. Це не прогноз погоди для старту.

## 5. Першоджерела для моделей

| Документ | Що з нього взято |
|---|---|
| [Apollo 11 Mission Report MSC-00171, Table A-I](https://ntrs.nasa.gov/citations/19700008096) | Маси LM: після DOI 33 401.6 lb (15 151 кг), на момент посадки 16 153.2 lb (7 327 кг) |
| [NASA TN D-7143, Apollo Experience Report: Descent Propulsion System](https://ntrs.nasa.gov/citations/19730011150) | Макс. тяга 10 500 lbf (46.7 кН), дроселювання 10:1, Isp 305 с |
| [NASA TR R-376, Sutton & Graves (1971)](https://ntrs.nasa.gov/citations/19720003329), Table II | K(CO₂) = 0.1210 для конвективного нагріву під час EDL Марса |
| [NASA Glenn Research Center: Mars Atmosphere Model](https://www.grc.nasa.gov/www/k-12/airplane/atmosmrm.html) | T(h), p(h), ρ(h) для EDL |
