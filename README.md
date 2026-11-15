Our project video -- https://www.youtube.com/watch?v=mwQuClk9Nj8

# ORBITAL — Earth Analog Explorer
 
A standalone React + Node.js application for the NASA Space Apps 2026 challenge “Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars”. This is an independent educational and research project. Sources and the limits of each analogy are shown in the interface.
 
## Running locally
 
Requires Node.js 22.13 or newer.
 
```sh
cd orbital
npm ci
npm run dev
```
 
Open the address printed by the server. Run `npm test` to execute the checks.
 
## Production run
 
```sh
npm run build
npm start
```
 
The Node.js server serves the React build from `dist/client` and the `/api` from a single origin. The port is set by the `PORT` variable and defaults to 3000. For Railway, set the Root Directory to `/orbital`. `railway.json` configures the build, the start command and the `/api/health` check. GitHub Pages cannot run the Node.js API, so the full application needs Node hosting.
 
## Features
 
- Three.js visualization of the Earth, Moon, Mars and Sun, direct planet selection, and markers shown only for the active world.
- Detailed local textures, auto-scrolling galleries, and an OpenStreetMap geographic map for Earth locations.
- A catalog of analogs with NASA/ESA sources, filters, and a comparison of confirmed traits. Missing data is marked as unknown.
- Live NASA POWER climate data with units, period and origin, cached for one day in the server’s memory.
- Analysis of new candidate sites. Declared geological traits are kept separate from the project’s climate filters. Candidates are unverified, stored in the browser, and can be exported as JSON.
- ORI guide: the “✧ ORI Guide” button in the header is always available on any page. The guide answers questions about the whole project (purpose, catalog, methodology, sources, climate, map, candidates, technologies) using only the project’s data; if the data has no answer, it says so directly. Ask about the selected point with the words “this location”, and about any other point by name. The conversation is kept while the page stays open. The guide executes commands: “Add Atacama and Namib to the comparison”, “Remove … from the comparison”, “Clear the comparison”, “Create candidate Death Valley 36.5 -117.1 Mars aridity cold” (with “evaluate”, the analysis starts immediately). Voice output: in English, with the browser’s voice; in Ukrainian, with the browser’s voice, or, if none is available, with the Piper neural model “ukrainian_tts” (rhasspy/piper-voices, MIT), which runs directly in the browser via onnxruntime-web. The model (~77 MB) is downloaded from Hugging Face on first playback and cached. If no voice is available at all, the voice buttons are hidden.
- 3D ORI avatar: a detailed astronaut (glass visor, face with blinking and lip movement synchronized to the voice, backpack, hoses). The model can be rotated 360° with a mouse or finger; without interaction it slowly rotates on its own.
 
## Chat configuration
 
ORI’s AI answers work through the Node server (`npm run dev:server`, `npm start` or hosting such as Railway). The server picks the first configured provider:
 
| Variable | Provider | Cost |
|---|---|---|
| `GEMINI_API_KEY` (+ `GEMINI_MODEL`) | Google Gemini, key from https://aistudio.google.com/apikey | free tier, best Ukrainian |
| `GROQ_API_KEY` (+ `GROQ_MODEL`) | Groq, key from https://console.groq.com/keys | free tier |
| `OPENAI_API_KEY` (+ `OPENAI_MODEL`) | OpenAI | paid |
| no key | Pollinations, no registration | free, ~1 answer / 45 s per server IP |
 
Set keys in the `.env` file (template: `.env.example`; the `.env` file itself is not committed to git) or in your hosting’s environment variables, never in `VITE_*` or client code. The model receives only the project’s facts and is instructed not to invent anything. If AI is unavailable or the free limit is exhausted, the guide’s local knowledge base answers instead, and this is noted under the answer. `FREE_AI=0` disables the keyless option. GitHub Pages has no server, so the local knowledge base always answers there. For production, you can set `PUBLIC_ORIGIN` to the site’s address without a trailing `/`.
 
## Structure and limitations
 
`src` contains the React components and the Three.js/Leaflet adapters, which clean up their resources. `shared` holds the catalog and filters, `server` is the HTTP API, and `public/assets` holds local textures and photographs. The server validates coordinates, allowed criteria, request size and origin; request limits and the cache apply per process.
 
An analogy is not proof that a site is suitable for settlement. POWER data are regional climate norms that do not replace on-site measurements. Long-term records and shared candidates would require a database. 3D requires WebGL; without it, a photo map is shown. Credits for photographs and textures are given in the application.
 
## Verified
 
Eight API tests, the production build, the server’s page delivery and `/api/health`. The public ORBITAL was previously checked in a browser, including filters, comparison, the map and NASA data. The full 3D scene was not verified in the available test browser because WebGL was disabled.
 
 
## GitHub Pages
 
Site: https://artemiy-13.github.io/Earth2Orbit/
 
```sh
npm ci
npm run deploy
```
 
`deploy` builds the project in `pages` mode (`base=/Earth2Orbit/`, `VITE_STATIC_API=true`) and publishes `dist/client` to the `gh-pages` branch. Without a Node server, the `/api` handlers run in the browser and NASA POWER is called directly. The AI chat is disabled on Pages. In Settings → Pages, choose the `gh-pages` branch and the `/ (root)` folder.
















Ukrainian version of README

# ORBITAL — Earth Analog Explorer

Самостійний React + Node.js застосунок для завдання NASA Space Apps 2026 “Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars”. Це незалежний навчально-дослідницький проєкт. Джерела й межі аналогій наведено в інтерфейсі.

## Локальний запуск

Потрібен Node.js 22.13 або новіший.

```sh
cd orbital
npm ci
npm run dev
```

Відкрий адресу, яку надрукує сервер. Для перевірок виконай `npm test`.

## Виробничий запуск

```sh
npm run build
npm start
```

Node.js сервер обслуговує React-збірку `dist/client` і `/api` з одного origin. Порт задається змінною `PORT`, типове значення 3000. Для Railway вкажи Root Directory `/orbital`. `railway.json` налаштовує збірку, запуск і перевірку `/api/health`. GitHub Pages не виконує Node.js API, тому для повного застосунку потрібен Node-хостинг.

## Можливості

- Three.js візуалізація Землі, Місяця, Марса та Сонця, прямий вибір планет і мітки лише активного світу.
- Деталізовані локальні текстури, галереї з автоматичним гортанням, географічна карта OpenStreetMap для земних локацій.
- Каталог аналогів із джерелами NASA/ESA, фільтрами й порівнянням підтверджених ознак. Відсутні дані позначені як невідомі.
- Живі кліматичні дані NASA POWER з одиницями, періодом, походженням і кешуванням на добу в пам’яті сервера.
- Аналіз нових кандидатур. Заявлені геологічні ознаки відокремлені від кліматичних фільтрів проєкту. Кандидатури неперевірені, зберігаються у браузері, експортуються як JSON.
- Гід ОРІ: кнопка «✧ Гід ОРІ» у шапці доступна завжди, на будь-якій сторінці. Гід відповідає про весь проєкт (мета, каталог, методика, джерела, клімат, карта, кандидатури, технології) лише з даних проєкту; якщо відповіді в даних немає, прямо про це каже. Про вибрану точку питають словами «ця локація», про будь-яку іншу — за назвою. Розмова зберігається, поки сторінка відкрита. Гід виконує команди: «Додай Атакаму та Наміб до порівняння», «Прибери … з порівняння», «Очисти порівняння», «Оформи кандидатуру Долина Смерті 36.5 -117.1 Марс сухість холод» (з «оціни» аналіз запускається одразу). Озвучення: англійською — голосом браузера; українською — голосом браузера, а якщо його немає, нейронною моделлю Piper «ukrainian_tts» (rhasspy/piper-voices, MIT), що працює прямо в браузері через onnxruntime-web. Модель (~77 МБ) завантажується з Hugging Face при першому прослуховуванні й кешується. Якщо голосу немає зовсім, кнопки озвучення приховано.
- 3D-аватар ОРІ: деталізований астронавт (скляний візор, обличчя з кліпанням і рухом губ під голос, ранець, шланги). Модель можна крутити мишею чи пальцем на 360°; без взаємодії вона повільно обертається сама.

## Налаштування чату

AI-відповіді ОРІ працюють через Node-сервер (`npm run dev:server`, `npm start` або хостинг на кшталт Railway). Сервер обирає першого налаштованого провайдера:

| Змінна | Провайдер | Вартість |
|---|---|---|
| `GEMINI_API_KEY` (+ `GEMINI_MODEL`) | Google Gemini, ключ з https://aistudio.google.com/apikey | безкоштовний рівень, найкраща українська |
| `GROQ_API_KEY` (+ `GROQ_MODEL`) | Groq, ключ з https://console.groq.com/keys | безкоштовний рівень |
| `OPENAI_API_KEY` (+ `OPENAI_MODEL`) | OpenAI | платно |
| без ключа | Pollinations, без реєстрації | безкоштовно, ~1 відповідь / 45 с на IP сервера |

Ключі задавай у файлі `.env` (шаблон — `.env.example`, сам `.env` у git не потрапляє) або в змінних середовища хостингу, ніколи у `VITE_*` чи клієнтському коді. Модель отримує лише факти проєкту й має інструкцію нічого не вигадувати. Якщо AI недоступний або вичерпано безкоштовний ліміт, відповідає локальна база знань гіда, і це підписано під відповіддю. `FREE_AI=0` вимикає безключовий варіант. На GitHub Pages сервера немає, тому там завжди відповідає локальна база знань. Для production можна вказати `PUBLIC_ORIGIN` рівним адресі сайту без кінцевого `/`.

## Структура й обмеження

`src` містить React-компоненти та адаптери Three.js/Leaflet з очищенням ресурсів. `shared` — каталог і фільтри, `server` — HTTP API, `public/assets` — локальні текстури й фотографії. Сервер перевіряє координати, допустимі критерії, розмір запитів та origin; ліміти запитів і кеш діють на один процес.

Аналогія не є доказом придатності території для поселення. Дані POWER — регіональні кліматичні норми, які не замінюють вимірювання на місці. Тривалі записи та спільні кандидатури потребуватимуть бази даних. Для 3D потрібен WebGL; за його відсутності відображається фотокарта. Авторство фотографій і текстур наведене в застосунку.

## Перевірено

Вісім тестів API, виробнича збірка, серверна видача сторінки й `/api/health`. Публічний ORBITAL раніше перевірено в браузері, включно з фільтрами, порівнянням, картою та даними NASA. Повна 3D-сцена в доступному тестовому браузері не перевірена через вимкнений WebGL.


## GitHub Pages

Сайт: https://artemiy-13.github.io/Earth2Orbit/

```sh
npm ci
npm run deploy
```

`deploy` збирає проєкт у режимі `pages` (`base=/Earth2Orbit/`, `VITE_STATIC_API=true`) і публікує `dist/client` у гілку `gh-pages`. Без Node-сервера обробники `/api` виконуються в браузері, NASA POWER викликається напряму. AI-чат на Pages вимкнений. У Settings → Pages оберіть гілку `gh-pages`, папка `/ (root)`.
