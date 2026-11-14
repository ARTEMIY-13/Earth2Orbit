# ORBITAL / Earth2Orbit — Earth Analog Explorer

Самостійний React + Node.js застосунок для завдання NASA Space Apps 2026
[«Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars»](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/).
Це незалежний навчально-дослідницький проєкт, а не продукт NASA і не сертифікована система керування
польотами. Джерела й межі аналогій наведено в інтерфейсі та в [`docs/`](docs).

## Локальний запуск

Потрібен Node.js 22.13 або новіший. `package.json` лежить у корені репозиторію.

```sh
npm ci
npm run dev:server   # Vite + Node API на одному порту (типово 3000): live DEM Землі, JPL Horizons
# або
npm run dev          # лише Vite: API виконується в браузері, Node-функції позначені як недоступні
```

Перевірки:

```sh
npm test             # тести API, рельєфу, спуску, Lambert, ефемерид (vs JPL Horizons), часу, сценаріїв
npm run lint         # oxlint; новий код перевіряється в суворому режимі (0 попереджень)
npm run build        # Node/Railway-збірка (base "/")
npm run build:pages  # GitHub Pages-збірка (base "/Earth2Orbit/")
```

## Режими розгортання

| Режим | Команди | Що доступно |
|---|---|---|
| Node (Railway тощо) | `npm run build && npm start` | Усе: React-збірка `dist/client`, `/api`, live DEM Землі (`/api/dem/earth`, лише AWS Terrain Tiles), звірка з JPL Horizons (`/api/horizons`, фіксований запит) |
| GitHub Pages | `npm run deploy` (`build:pages` → гілка `gh-pages`) | Каталог, карти, клімат NASA POWER, планувальник місії на підготовлених DEM-вирізках і вбудованих ефемеридах. Node-функції вимкнені з поясненням; до `/api` Node-маршрутів запитів немає |

Node-сервер слухає `PORT` (типово 3000). `railway.json` налаштовує збірку, запуск і перевірку
`/api/health`. Root Directory — корінь репозиторію (окремого каталогу `orbital/` немає).
Сайт GitHub Pages: <https://artemiy-13.github.io/Earth2Orbit/>.

## Можливості

- Three.js-візуалізація Землі, Місяця, Марса й Сонця; каталог аналогів із джерелами NASA/ESA,
  фільтри, порівняння, карти, галереї, кліматичні дані NASA POWER, аналіз нових кандидатур, 3D-гід.
- **Аналіз рельєфу й планувальник місії** ([інструкція](docs/USER_GUIDE.md)):
  - реальні DEM: LRO LOLA (Місяць, 20 і 30 м/пікс.), MGS MOLA (Марс, 463 м/пікс.), AWS Terrain Tiles
    (Земля) з повною провенансною інформацією й SHA-256 ([джерела](docs/DATA_SOURCES.md));
  - ухил/експозиція (Горн, у метрах), шорсткість, статистика еліпса, поздовжній/поперечний/довільний
    профілі, горизонталі, шари ризику; експорт профілів у CSV;
  - три незалежні вердикти: «Рельєф», «Посадка апарата», «Переліт»; критичні пропуски ніколи не дають
    позитивного висновку;
  - симуляція моторного спуску (RK4, фіксований крок, пошук контакту з DEM між кроками);
  - датований переліт Земля→Місяць / Земля→Марс (Lambert, patched conics, пошук вікна), UTC + Europe/Kyiv;
  - 3D-перегляд перельоту й посадки на тих самих станах, що й графіки; таймлайн і камери;
  - порівняння з земними аналогами на узгодженому масштабі;
  - експорт і імпорт сценарію JSON із перевіркою відтворюваності.
- Моделі та їхні межі: [`docs/MODELS_AND_LIMITATIONS.md`](docs/MODELS_AND_LIMITATIONS.md).

## Дані

`public/dem/` містить невеликі вирізки (≈1.6 МБ). Їх відтворює скрипт:

```sh
npm run fetch:dem                 # NASA PDS (LOLA, MOLA) + AWS Terrain Tiles через HTTP Range
npm run fetch:horizons-fixture    # еталонні вектори JPL Horizons для тестів
```

Великі сирі набори в репозиторій не додаються.

## Налаштування чату

Без серверного `OPENAI_API_KEY` AI-чат явно вимкнений. Ключів у репозиторії немає. Задавай ключ лише
в середовищі сервера, ніколи в `VITE_*` чи клієнтському коді. Для production можна вказати
`PUBLIC_ORIGIN` — адресу сайту без кінцевого `/`. Необов'язковий `OPENAI_MODEL` обирає модель.

## Структура

- `src` — React-компоненти й адаптери Three.js/Leaflet з очищенням ресурсів;
  `src/components/mission` — планувальник; `src/scene/landing.js` — 3D місії;
  `src/workers` — обчислення поза головним потоком.
- `shared` — каталог і фільтри; `shared/terrain` — DEM-аналітика; `shared/mission` — solver-и, час,
  ефемериди, вердикти.
- `server` — HTTP API; `server/node-api.mjs` і `server/data` — Node-only маршрути та адаптери.
- `scripts` — підготовка даних і dev-сервер.

Аналогія не доводить придатності території для поселення. Дані POWER — регіональні кліматичні норми.
Для 3D потрібен WebGL; без нього лишаються фотокарта, 2D-карта DEM, профілі й таблиці.

## GitHub Pages

```sh
npm ci
npm run deploy
```

`deploy` збирає проєкт у режимі `pages` (`base=/Earth2Orbit/`) і публікує `dist/client` у гілку
`gh-pages`. У Settings → Pages обери гілку `gh-pages`, папку `/ (root)`.
