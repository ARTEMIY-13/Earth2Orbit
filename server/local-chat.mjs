// Гід ОРІ: відповіді лише з даних проєкту (каталог, методика, інтерфейс),
// без зовнішнього AI та ключів. Якщо даних немає — прямо про це каже.
import { translations } from "../src/i18n/translations.js";
import {
  catalog,
  criteria,
  challenge,
  methodologySource,
} from "../shared/catalog.js";

const targetName = { moon: "Місяць", mars: "Марс", earth: "Земля" };
const traitName = {
  aridity: "сухість", robotics: "тести роботів", astrobiology: "астробіологія",
  cold: "холод", ice: "лід", volcanic: "вулканізм", basalt: "базальти",
  dust: "пил", radiation: "радіація", altitude: "висота", isolation: "ізоляція",
  impact: "ударна геологія", caves: "печери",
};
const tx = (en) => (text) => (en ? (translations.en[text] ?? text) : text);
const norm = (text) =>
  String(text || "").toLowerCase().replace(/[’ʼ`]/g, "'").replace(/\s+/g, " ").trim();
// Латинські слова шукаємо з початку слова (use ≠ because), кириличні — як підрядок.
function kw(q, words) {
  return words.some((word) =>
    /^[a-z]/.test(word) ? new RegExp("\\b" + word).test(q) : q.includes(word),
  );
}
const sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
const earth = catalog.find((world) => world.id === "earth");

const KW = {
  coords: ["координат", "де ", "розташ", "широт", "довгот", "lat", "lon", "where", "coordinate", "latitude", "longitude", "located"],
  why: ["чому", "аналог", "схож", "навіщо", "для чого", "why", "analog", "similar", "purpose"],
  evidence: ["доказ", "дослід", "наук", "джерел", "місі", "організ", "evidence", "research", "science", "source", "mission", "who "],
  uses: ["використ", "тест", "випроб", "практи", "робот", "use", "test", "experiment", "robot"],
  limits: ["обмеж", "відміннос", "різниц", "недолік", "проблем", "ризик", "бракує", "прогалин", "невідом", "limit", "difference", "risk", "problem", "missing", "lack", "gap", "unknown"],
  base: ["баз", "жити", "придат", "селит", "колон", "base", "live", "habitable", "settle", "colony", "suitab"],
  climate: ["клімат", "температур", "опад", "погод", "climate", "temperature", "rain", "weather"],
};
const ANALOG_WORDS = ["аналог", "analog"];

// Слова, спільні для багатьох назв: за ними локацію не впізнаємо.
const GENERIC = new Set([
  "кратер", "пустеля", "море", "басейн", "плато", "рівнина", "вулкан", "пік", "острів",
  "долина", "долини", "сухі", "лавові", "поля", "південний", "північний", "полюс",
  "планітія", "салар", "гавайські", "марсіанські",
  "crater", "desert", "sea", "basin", "plateau", "plain", "planitia", "island",
  "valley", "valleys", "dry", "lava", "fields", "south", "north", "pole", "highlands",
  "volcano", "mount", "peak", "salar", "mons", "mare", "hawaiian",
]);
const ALIASES = {
  "earth-1": ["devon", "haughton", "готон"],
  "earth-2": ["антаркт", "antarctic", "dry valley", "сухі долини", "мак-мердо", "mcmurdo"],
  "earth-3": ["гаваї", "hawai", "кілауеа", "kilauea"],
  "earth-5": ["ісланд", "iceland"],
  "earth-7": ["tenerife", "тенеріфе"],
  "earth-10": ["lanzarote"],
};
const stem = (word) => (word.length <= 4 ? word : word.slice(0, -1));

function findPlaces(q) {
  const found = [];
  for (const world of catalog)
    for (const place of world.places) {
      const names = [place.name, translations.en[place.name] ?? place.name];
      const words = names
        .flatMap((name) => norm(name).split(/[\s\-—–]+/))
        .filter((word) => word.length >= 4 && !GENERIC.has(word));
      if (
        words.some((word) => q.includes(stem(word))) ||
        (ALIASES[place.id] || []).some((alias) => q.includes(alias))
      )
        found.push({ world, place });
    }
  return found;
}

// «ця локація», «this place», «тут» — питання саме про вибрану точку.
function refersToSelection(q) {
  return (
    /(^|\s)(ця|цей|цю|цієї|цього|ці)\s+(локаці|точк|місц|мітк|аналог|кратер|пустел)/.test(q) ||
    /(^|\s)(тут|обран|вибран)/.test(q) ||
    /\bthis (an? )?(location|place|point|site|marker|spot|analog)/.test(q) ||
    /\b(here|selected|chosen)\b/.test(q)
  );
}

function siteSummary(world, site, en) {
  const T = tx(en), s = site.science, coords = `${site.lat}°, ${site.lon}°`;
  let text = en
    ? `${T(site.name)} (${T(world.name)}, ${coords}), ${T(site.type).toLowerCase()}. ${T(site.description)}`
    : `${site.name} (${world.name}, ${coords}) — ${site.type.toLowerCase()}. ${site.description}`;
  if (s) {
    text += ` ${T(s.summary)}`;
    if (s.limit) text += en ? ` Limitations: ${T(s.limit)}` : ` Обмеження: ${s.limit}`;
  } else
    text += en
      ? " For Moon and Mars points the catalog has a description, coordinates and photos, but no evidence record like the Earth analogs have."
      : " Для місячних і марсіанських точок каталог має опис, координати й фото, але не має записів про докази, як у земних аналогів.";
  return text + (en
    ? " Ask about coordinates, evidence, limitations, uses or base suitability."
    : " Запитай про координати, докази, обмеження, використання або придатність для бази.");
}

function siteParts(world, site, q, en) {
  const T = tx(en), s = site.science, coords = `${site.lat}°, ${site.lon}°`;
  const name = T(site.name), parts = [];
  if (kw(q, KW.coords))
    parts.push(en ? `${name} is on ${T(world.name)} at ${coords}.` : `${site.name} — ${world.name}, координати ${coords}.`);
  if (!s) {
    if (kw(q, [...KW.why, ...KW.evidence, ...KW.uses, ...KW.limits, ...KW.base, ...KW.climate]))
      parts.push(en
        ? `The catalog has no evidence record for ${name}: only a description, coordinates and photos.`
        : `Для «${site.name}» каталог не має записів про докази: лише опис, координати й фото.`);
    return parts;
  }
  const targets = (s.targets || [])
    .map((target) => (en ? T(targetName[target] || target) : targetName[target] || target)).join(", ");
  const traits = (s.traits || []).map((trait) => T(traitName[trait] || trait)).join(", ");
  const uses = (s.uses || []).map(T).join("; ");
  if (kw(q, KW.why))
    parts.push(en
      ? `${name} is a ${T(site.type).toLowerCase()}${targets ? ` (an analog for: ${targets})` : ""}. ${T(site.description)}${traits ? ` Key features: ${traits}.` : ""}`
      : `${site.name} — ${site.type.toLowerCase()}${targets ? ` (аналог для: ${targets})` : ""}. ${site.description}${traits ? ` Ключові риси: ${traits}.` : ""}`);
  if (kw(q, KW.evidence))
    parts.push(
      T(s.summary || "Детальних доказів для цієї локації немає.") +
        (s.organization ? (en ? ` Organization: ${s.organization}.` : ` Організація: ${s.organization}.`) : "") +
        (s.sources?.length ? (en ? ` Source: ${T(s.sources[0].title)}.` : ` Джерело: ${s.sources[0].title}.`) : ""),
    );
  if (kw(q, KW.uses) && uses)
    parts.push(en ? `This site is used for: ${uses}.` : `Тут використовують для: ${uses}.`);
  if (kw(q, KW.limits))
    parts.push(en
      ? `Limitations of the analog: ${T(s.limit || "потрібні окремі дослідження")}`
      : `Обмеження аналога: ${s.limit || "потрібні окремі дослідження"}`);
  if (kw(q, KW.base))
    parts.push(en
      ? `Base suitability depends on more than climate: geology, water, energy, radiation, and logistics all matter. For ${name}: ${T(s.summary || site.description)}${s.limit ? ` Limitations: ${T(s.limit)}` : ""}`
      : `Придатність для бази визначають не лише кліматом: потрібні геологія, вода, енергія, радіація й логістика. Для ${site.name} відомо: ${s.summary || site.description}${s.limit ? ` Обмеження: ${s.limit}` : ""}`);
  if (kw(q, KW.climate))
    parts.push(en
      ? "Climate data for this location is shown in the climate panel of its card (NASA POWER). Climate thresholds are only a filter, not evidence of suitability."
      : "Клімат цієї точки показано в кліматичній панелі її картки (NASA POWER). Кліматичні пороги — лише фільтр, а не доказ придатності.");
  return parts;
}

function worldText(world, q, en) {
  const T = tx(en);
  const stats = world.stats.map(([label, value]) => `${sentence(T(label))}: ${T(value)}`).join("; ");
  const names = world.places.map((place) => T(place.name)).join(", ");
  let text = `${T(world.name)}. ${T(world.desc)} ${stats}.`;
  text += world.places.length
    ? en ? ` The catalog has ${world.places.length} locations: ${names}.` : ` У каталозі ${world.places.length} локацій: ${names}.`
    : en ? " The catalog has no locations for the Sun." : " Локацій для Сонця в каталозі немає.";
  if (["moon", "mars"].includes(world.id) && kw(q, ANALOG_WORDS)) {
    const analogs = earth.places.filter((place) => place.science?.targets.includes(world.id));
    text += en
      ? ` Earth analogs for this world (${analogs.length}): ${analogs.map((place) => T(place.name)).join(", ")}.`
      : ` Земні аналоги для цього світу (${analogs.length}): ${analogs.map((place) => place.name).join(", ")}.`;
  }
  return text;
}

const statusCount = (status) => earth.places.filter((place) => place.science?.status === status).length;

// Кожен намір: strong — може бути другою частиною відповіді, weak — лише самостійно.
const intents = (en) => {
  const T = tx(en), P = (uk, e) => (en ? e : uk);
  const moon = catalog.find((world) => world.id === "moon").places.length;
  const mars = catalog.find((world) => world.id === "mars").places.length;
  return [
    {
      test: (q) => kw(q, ["кандидат", "candidate", "додати локац", "нову локац", "власн", "add a location", "add location", "new location"]),
      answer: () => P(
        "Вкладка «Кандидат»: вкажи назву, координати (точку можна обрати на карті), цільовий світ — Місяць або Марс — і заявлені ознаки. Проєкт підтягує кліматичні норми NASA POWER і позначає сухість (середні опади < 1 мм/день) та холод (середня температура < 0 °C). Кандидатури неперевірені: геологія й інженерні умови потребують окремих доказів. Вони зберігаються у браузері та експортуються як JSON.",
        "The “Candidate” tab: enter a name, coordinates (you can pick the point on the map), the target world — Moon or Mars — and declared traits. The project fetches NASA POWER climate norms and flags aridity (mean precipitation < 1 mm/day) and cold (mean temperature < 0 °C). Candidates are unverified: geology and engineering conditions need separate evidence. They are stored in the browser and can be exported as JSON."),
    },
    {
      test: (q) => kw(q, ["порівн", "таблиц", "compar", "table"]),
      answer: () => P(
        "Вкладка «Порівняння» показує таблицю підтверджених ознак вибраних земних аналогів. Додавай локації кнопкою «⇄ До порівняння» в картці. Кількість позначок — це обсяг підтверджених ознак, а не відсоток подібності чи придатність бази; «Немає даних» зберігає невизначеність.",
        "The “Comparison” tab shows a table of confirmed traits for the Earth analogs you pick. Add sites with the “⇄ Add to comparison” button in a location card. The number of marks shows how many traits are confirmed, not a similarity percentage or base suitability; “No data” keeps the uncertainty visible."),
    },
    {
      test: (q) => kw(q, ["клімат", "температур", "опад", "погод", "power", "climate", "temperature", "rain", "weather", "precipitation"]),
      answer: () => P(
        "Для земних локацій у картці є кліматична панель із даними NASA POWER: середні норми з одиницями, періодом і походженням. Це регіональні норми, а не вимірювання мікроклімату конкретного місця. Сервер кешує відповіді на добу. Пороги «сухість» і «холод» — фільтри проєкту, а не доказ придатності.",
        "For Earth locations the card has a climate panel with NASA POWER data: mean norms with units, period and origin. These are regional norms, not measurements of a specific site’s microclimate. The server caches responses for a day. The “aridity” and “cold” thresholds are project filters, not proof of suitability."),
    },
    {
      test: (q) => kw(q, ["карт", "openstreetmap", "map", "osm"]),
      answer: () => P(
        "Для земних локацій є географічна карта на основі OpenStreetMap: кнопка «⌖ Карта» у списку аналогів і «⌖ Ця локація на карті» в картці. Клік по мітці обирає локацію, а при створенні кандидата карта дозволяє вказати координати.",
        "Earth locations have a geographic map based on OpenStreetMap: the “⌖ Map” button in the analog list and “⌖ This location on the map” in a card. Clicking a marker selects the location, and when creating a candidate the map lets you pick coordinates."),
    },
    {
      test: (q) => kw(q, ["критері", "ознак", "фільтр", "criteri", "filter", "trait"]),
      answer: () => P(
        `У каталозі ${criteria.length} ознак для фільтрації: ` + criteria.map((item) => `${item.label} — ${item.description.toLowerCase()}`).join("; ") + ". Усі обрані ознаки мають збігатися одночасно; відсутні докази лишаються невідомими.",
        `The catalog has ${criteria.length} traits to filter by: ` + criteria.map((item) => `${T(item.label)} — ${T(item.description).toLowerCase()}`).join("; ") + ". All selected traits must match at once; missing evidence stays unknown."),
    },
    {
      test: (q) => kw(q, ["3d", "сцен", "текстур", "webgl", "three", "обертан", "scene", "texture", "rotate"]),
      answer: () => P(
        "Центральна 3D-сцена (Three.js) показує Землю, Місяць, Марс і Сонце. Перемикай світи в шапці, натискай на планети й мітки, перетягуй для обертання. Мітки показано лише для активного світу, масштаб умовний. Для 3D потрібен WebGL; без нього показується фотокарта.",
        "The central 3D scene (Three.js) shows Earth, the Moon, Mars and the Sun. Switch worlds in the header, click planets and markers, drag to rotate. Markers are shown only for the active world, and the scale is symbolic. 3D needs WebGL; without it a photo map is shown."),
    },
    {
      test: (q) => kw(q, ["джерел", "фото", "авторств", "nasa", "esa", "jpl", "source", "credit", "photo", "where does the data", "звідки"]),
      answer: () => P(
        `Еталонні записи спираються на матеріали NASA, JPL та ESA; для ландшафтних кандидатур прогалини позначено. Кліматичні дані — NASA POWER. Фото — NASA (авторство в підписах), текстури планет — Solar System Scope (CC BY 4.0), фотокарти Землі — FURY Data, Місяць — NASA LROC. Завдання: ${challenge.url}. Методика аналогів: ${methodologySource}`,
        `Reference records rely on NASA, JPL and ESA material; gaps are marked for landscape candidates. Climate data comes from NASA POWER. Photos are NASA (credits in captions), planet textures are Solar System Scope (CC BY 4.0), Earth photo maps are FURY Data, the Moon is NASA LROC. Challenge: ${challenge.url}. Analog methodology: ${methodologySource}`),
    },
    {
      test: (q) => kw(q, ["мов", "english", "англ", "українськ", "language", "ukrainian", "translat", "переклад"]),
      answer: () => P(
        "Інтерфейс і гід працюють українською та англійською: перемикач UA/EN у шапці, вибір запам’ятовує браузер. Озвучення відповідей залежить від голосів, доступних на пристрої.",
        "The interface and the guide work in Ukrainian and English: use the UA/EN switch in the header; the browser remembers your choice. Voice playback depends on the voices available on your device."),
    },
    {
      test: (q) => kw(q, ["хто ти", "who are you", "озвуч", "голос", "voice", " орі", "ori ", "ai ", "штучн", "що вмієш", "what can you"]),
      answer: () => P(
        "Я ОРІ — науковий гід ORBITAL. Відповідаю лише з даних проєкту: каталог локацій, методика, джерела та інтерфейс; якщо даних немає — кажу про це прямо. Відповіді можна озвучувати голосом браузера. Про вибрану точку питай словами «ця локація». Я також виконую команди: «Додай Атакаму та Наміб до порівняння», «Прибери Атакаму з порівняння», «Оформи кандидатуру Долина Смерті 36.5 -117.1 Марс сухість холод оціни».",
        "I’m ORI, the ORBITAL science guide. I answer only from the project’s data: the location catalog, methodology, sources and interface; if there is no data I say so. Answers can be read aloud with the browser voice. Ask about the selected point with “this location”. I also run commands: “Add Atacama and Namib to comparison”, “Remove Atacama from comparison”, “Create candidate Death Valley 36.5 -117.1 Mars aridity cold evaluate”."),
    },
    {
      test: (q) => kw(q, ["технолог", "react", "node", "vite", "стек", "хостинг", "github", "railway", "deploy", "запуск", "tech", "stack", "hosting", "built with", "run it", "install"]),
      answer: () => P(
        "Клієнт — React 19 + Vite, 3D на Three.js, карта на Leaflet/OpenStreetMap. Сервер — Node.js з /api: каталог, фільтри, клімат NASA POWER, оцінка кандидатур і чат. На GitHub Pages обробники /api виконуються в браузері. Потрібен Node.js 22.13+: npm ci, npm run dev; тести — npm test.",
        "The client is React 19 + Vite, 3D uses Three.js, the map uses Leaflet/OpenStreetMap. The server is Node.js with /api: catalog, filters, NASA POWER climate, candidate evaluation and chat. On GitHub Pages the /api handlers run in the browser. Node.js 22.13+ is required: npm ci, npm run dev; tests: npm test."),
    },
    {
      test: (q) => kw(q, ["місяц", "місяч", "moon", "lunar", "марс", "mars", "сонц", "sun", "земл", "earth"]) && !(kw(q, ANALOG_WORDS) && !kw(q, ["місяц", "місяч", "moon", "lunar", "марс", "mars"])),
      answer: (q) => {
        const wanted = [
          [["місяц", "місяч", "moon", "lunar"], "moon"],
          [["марс", "mars"], "mars"],
          [["сонц", "sun"], "sun"],
          [["земл", "earth"], "earth"],
        ].filter(([words]) => kw(q, words)).map(([, id]) => id).slice(0, 2);
        return wanted.map((id) => worldText(catalog.find((world) => world.id === id), q, en)).join("\n\n");
      },
    },
    {
      weak: true,
      test: (q) => kw(q, ["завдання", "space apps", "challenge", "змаган", "хакатон", "hackathon"]),
      answer: () => P(
        `Проєкт створено за завданням NASA Space Apps ${challenge.year}: «${challenge.title}». Сторінка завдання: ${challenge.url}`,
        `The project was built for the NASA Space Apps ${challenge.year} challenge: “${challenge.title}”. Challenge page: ${challenge.url}`),
    },
    {
      weak: true,
      test: (q) => kw(q, ["що таке аналог", "що означає аналог", "типи аналог", "what is an analog", "what are analog", "what does analog", "analog mean", "types of analog"]),
      answer: () => P(
        "Планетарний аналог — земне місце, де окремі умови (геологія, клімат, ізоляція, операційні сценарії) подібні до місячних чи марсіанських; там випробовують прилади, роботів і процедури. Типи: геологічні (породи, рельєф), астробіологічні (умови життя й біосигнатури) та місійні (процедури й робота експедиції). Аналогія часткова: атмосфера, гравітація й біологічні процеси відрізняються.",
        "A planetary analog is an Earth location where some conditions (geology, climate, isolation, operations) resemble the Moon or Mars; instruments, robots and procedures are tested there. Types: geological (rocks, terrain), astrobiological (habitability and biosignatures) and mission (procedures and expedition work). The analogy is partial: atmosphere, gravity and biological processes differ."),
    },
    {
      weak: true,
      test: (q) => kw(q, ["скільки", "список", "перелік", "каталог", "які є", "які локац", "які аналог", "локацій", "how many", "list", "catalog", "which sites", "which locations", "what sites", "what locations", "analogs"]),
      answer: () => {
        const names = earth.places.map((place) => T(place.name)).join(", ");
        const reference = statusCount("reference");
        return P(
          `У каталозі ${earth.places.length} земних локацій-аналогів (${reference} із документованими джерелами, решта потребує перевірки), ${moon} місячних і ${mars} марсіанських орієнтирів. Земні: ${names}. Спитай про будь-яку з них за назвою.`,
          `The catalog has ${earth.places.length} Earth analog locations (${reference} with documented sources, the rest need verification), ${moon} lunar and ${mars} Martian reference points. Earth: ${names}. Ask me about any of them by name.`);
      },
    },
    {
      weak: true,
      test: (q) => kw(q, ["обмеж", "limit", "чи придат", "suitab", "бракує", "прогалин", "доказ", "evidence", "reliab", "надійн", "точн", "accura"]),
      answer: () => P(
        "Обмеження проєкту: аналогія не є доказом придатності території для поселення. Дані NASA POWER — регіональні кліматичні норми, а не вимірювання на місці. Координати регіонів орієнтовні. Кандидатури неперевірені, а довгі записи й спільні кандидатури потребували б бази даних. Повна 3D-сцена вимагає WebGL.",
        "Project limitations: an analogy is not proof that a territory is suitable for settlement. NASA POWER data are regional climate norms, not on-site measurements. Region coordinates are approximate. Candidates are unverified, and long-term records or shared candidates would need a database. The full 3D scene requires WebGL."),
    },
    {
      weak: true,
      test: (q) => kw(q, ["як користува", "як працю", "інструкц", "допомог", "навігац", "з чого почати", "how to", "how do i", "how does", "help", "instruction", "get started", "navigate"]),
      answer: () => P(
        "Обери світ у шапці (Земля, Місяць, Марс, Сонце). У правій панелі є вкладки «Аналоги» (пошук, фільтри за ціллю й ознаками, карта), «Порівняння», «Кандидат» і «Методика». Натисни локацію, щоб побачити картку з галереєю, координатами й кліматом. «◎ Огляд системи» повертає загальний вигляд, а мене завжди можна відкрити кнопкою «✧ Гід ОРІ» в шапці.",
        "Pick a world in the header (Earth, Moon, Mars, Sun). The right panel has tabs: “Analogs” (search, filters by target and traits, map), “Comparison”, “Candidate” and “Methodology”. Click a location to open its card with gallery, coordinates and climate. “◎ System overview” restores the overall view, and you can always open me with the “✧ ORI Guide” button in the header."),
    },
    {
      weak: true,
      test: (q) => kw(q, ["проєкт", "проект", "orbital", "про що", "що це", "що таке", "призначення", "what is", "about", "project", "purpose", "overview"]),
      answer: () => P(
        `ORBITAL — Earth Analog Explorer: незалежний навчально-дослідницький проєкт за завданням NASA Space Apps ${challenge.year}. Він допомагає знайти земні місця, умови яких нагадують місячні та марсіанські бази: 3D-сцена Землі, Місяця, Марса й Сонця, каталог аналогів із джерелами NASA/ESA, порівняння ознак, живі кліматичні дані NASA POWER та аналіз нових кандидатур. Аналогія не є доказом придатності території для поселення.`,
        `ORBITAL — Earth Analog Explorer is an independent educational research project for the NASA Space Apps ${challenge.year} challenge. It helps find Earth locations whose conditions resemble Moon and Mars bases: a 3D scene of Earth, Moon, Mars and the Sun, a catalog of analogs with NASA/ESA sources, trait comparison, live NASA POWER climate data and analysis of new candidates. An analogy is not proof that a territory is suitable for settlement.`),
    },
    {
      weak: true,
      test: (q) => q.length < 40 && /(^|\s)(привіт|вітаю|добрий|hello|hi|hey)(\s|!|$)/.test(q),
      answer: () => P(
        "Вітаю! Я ОРІ — гід проєкту ORBITAL. Запитай про проєкт, каталог аналогів, методику, джерела або конкретну локацію.",
        "Hello! I’m ORI, the ORBITAL project guide. Ask about the project, the analog catalog, methodology, sources or a specific location."),
    },
  ];
};

// ---------- Команди гіда: порівняння та кандидатури ----------
const MAX_COMPARE = 3;
const earthIds = new Set(earth.places.map((place) => place.id));
export const cleanCompareIds = (ids) =>
  (Array.isArray(ids) ? ids : []).filter((id) => earthIds.has(id)).slice(0, MAX_COMPARE);
// Питання на кшталт «Як додати…» чи «Що таке…» — це пояснення, а не команда.
const QUESTION_START = /^(як |how |що таке |що означає |what is |what are |чи |can |does |де |where )/;
const TRAIT_WORDS = {
  aridity: ["сухіст", "посух", "arid", "dry"],
  cold: ["холод", "cold"],
  impact: ["удар", "impact"],
  basalt: ["вулкан", "базальт", "volcan", "basalt"],
  caves: ["печер", "cave"],
  isolation: ["ізоляц", "isolat"],
  robotics: ["робот"],
  astrobiology: ["астробіолог", "astrobio"],
};
const SUBMIT_WORDS = ["оціни", "оцінити", "проаналізуй", "запусти", "одразу", "відправ", "submit", "evaluate", "analyze", "analyse", "run ", "immediately", "right away"];

function context(world, site, messages, lang, state = {}) {
  const en = lang === "en";
  const raw = String(messages.at(-1)?.content || "");
  const selectedWorld = world && catalog.find((item) => item.id === world.id);
  const selected = selectedWorld && site ? selectedWorld.places[site.index] : null;
  return { en, T: tx(en), raw, q: norm(raw) + " ", selectedWorld, selected, state };
}

function compareCommand({ en, T, q, selected, selectedWorld, state }) {
  const P = (uk, e) => (en ? e : uk);
  if (!kw(q, ["порівнян", "порівняй", "порівняти", "compar"])) return null;
  const removeVerb = kw(q, ["прибер", "видал", "викин", "забер", "remove", "delete", "drop"]);
  const clearVerb = kw(q, ["очист", "скинь", "скинути", "clear", "reset"]);
  const openVerb = kw(q, ["відкр", "покажи", "перейд", "open", "show", "go to"]);
  const addVerb = kw(q, ["додай", "додати", "додав", "добав", "порівняй", "порівняти", "add", "compare", "put", "до порівнян", "в порівнян", "to comparison", "to the comparison"]);
  if (!(removeVerb || clearVerb || openVerb || addVerb)) return null;

  const named = findPlaces(q);
  let places = named.filter(({ place }) => earthIds.has(place.id)).map(({ place }) => place);
  const skipped = named.filter(({ place }) => !earthIds.has(place.id)).map(({ place }) => place);
  if (!named.length && selected && refersToSelection(q) && earthIds.has(selected.id))
    places = [selected];
  if (!named.length && selected && refersToSelection(q) && !earthIds.has(selected.id))
    skipped.push(selected);
  places = [...new Map(places.map((place) => [place.id, place])).values()];
  const label = (id) => T(earth.places.find((place) => place.id === id).name);
  const current = cleanCompareIds(state.compareIds);
  const list = (ids) => ids.map(label).join(", ");
  const openButton = { type: "compare", op: "open", label: P("Відкрити порівняння", "Open comparison") };
  const onlyEarth = skipped.length
    ? P(` Порівняння працює лише для земних аналогів, тож «${skipped.map((s) => s.name).join(", ")}» пропущено.`,
        ` Comparison works only for Earth analogs, so ${skipped.map((s) => T(s.name)).join(", ")} was skipped.`)
    : "";

  if (removeVerb && (places.length || !clearVerb)) {
    if (!places.length)
      return { text: P("Скажи, яку локацію прибрати з порівняння, наприклад «Прибери Атакаму з порівняння», або «Очисти порівняння».", "Tell me which location to remove, e.g. “Remove Atacama from comparison”, or say “Clear the comparison”."), actions: [] };
    const ids = places.map((place) => place.id), left = current.filter((id) => !ids.includes(id));
    return {
      text: P(`Прибрано з порівняння: ${list(ids)}. ${left.length ? `Лишилось (${left.length}/${MAX_COMPARE}): ${list(left)}.` : "Порівняння порожнє."}`,
              `Removed from comparison: ${list(ids)}. ${left.length ? `Remaining (${left.length}/${MAX_COMPARE}): ${list(left)}.` : "The comparison is empty."}`),
      actions: [{ type: "compare", op: "remove", ids, auto: true }],
    };
  }
  if (clearVerb || (removeVerb && !places.length))
    return {
      text: P("Порівняння очищено.", "The comparison is cleared."),
      actions: [{ type: "compare", op: "clear", auto: true }],
    };
  if (openVerb && !places.length && !addVerb)
    return { text: P("Відкриваю порівняння.", "Opening the comparison."), actions: [{ type: "compare", op: "open", auto: true }] };
  if (!places.length) {
    if (skipped.length) return { text: onlyEarth.trim(), actions: [] };
    return {
      text: P(`Яку локацію додати? Назви її, наприклад «Додай Атакаму та Наміб до порівняння», або вибери точку й скажи «додай цю локацію до порівняння».${current.length ? ` Зараз у порівнянні: ${list(current)}.` : ""}`,
              `Which location should I add? Name it, e.g. “Add Atacama and Namib to comparison”, or select a point and say “add this location to comparison”.${current.length ? ` Currently in comparison: ${list(current)}.` : ""}`),
      actions: [],
    };
  }
  const adding = [], already = [], over = [];
  for (const place of places) {
    if (current.includes(place.id)) already.push(place.id);
    else if (current.length + adding.length < MAX_COMPARE) adding.push(place.id);
    else over.push(place.id);
  }
  const final = [...current, ...adding];
  const parts = [];
  if (adding.length) parts.push(P(`Додав до порівняння: ${list(adding)}.`, `Added to comparison: ${list(adding)}.`));
  if (already.length) parts.push(P(`Уже в порівнянні: ${list(already)}.`, `Already in the comparison: ${list(already)}.`));
  if (over.length) parts.push(P(`Не вмістилося: ${list(over)}. Для читабельності порівняння — до трьох локацій; скажи «прибери …», щоб звільнити місце.`, `No room for: ${list(over)}. The comparison stays readable with up to three locations; say “remove …” to free a slot.`));
  parts.push(P(`Зараз у порівнянні (${final.length}/${MAX_COMPARE}): ${list(final)}.`, `In the comparison now (${final.length}/${MAX_COMPARE}): ${list(final)}.`) + onlyEarth);
  return {
    text: parts.join(" "),
    actions: [...(adding.length ? [{ type: "compare", op: "add", ids: adding, auto: true }] : []), openButton],
  };
}

function parseCandidate(raw) {
  const work = raw.replace(/[−–]/g, "-").replace(/(\d),(\d)/g, "$1.$2");
  const quoted = work.match(/[«"“„]([^»"”“]{2,100})[»"”“]/);
  const word = work.match(/кандидатур\S*|candidate\S*/i);
  const start = quoted ? quoted.index + quoted[0].length : word ? word.index + word[0].length : 0;
  const remainder = work.slice(start);
  const firstNumber = remainder.search(/-?\d/);
  const keyword = remainder.search(/\s(для|ознак\S*|ціль|target|for|traits?|координат\S*|coordinates?|широт\S*|lat\S*)(\s|:|$)/i);
  const nameEnd = Math.min(...[firstNumber, keyword].filter((i) => i >= 0), remainder.length);
  let name = quoted
    ? quoted[1].trim()
    : remainder
        .slice(0, nameEnd)
        .replace(/^[\s:,\-–—]*(з назвою|під назвою|називається|назва|named|called|name)?[\s:,\-–—]*/i, "")
        .replace(/[\s:,;\-–—]+$/, "")
        .trim();
  if (name.length > 100) name = name.slice(0, 100).trim();
  const tailStart = quoted ? 0 : nameEnd;
  const numbers = [...remainder.slice(tailStart).matchAll(/-?\d+(?:\.\d+)?/g)];
  const lat = numbers[0] ? Number(numbers[0][0]) : null;
  const lon = numbers[1] ? Number(numbers[1][0]) : null;
  const tail = norm(remainder.slice(numbers[1] ? tailStart + numbers[1].index + numbers[1][0].length : tailStart));
  const moonAt = ["місяц", "місяч", "moon", "lunar"].map((w) => tail.indexOf(w)).filter((i) => i >= 0);
  const marsAt = ["марс", "mars"].map((w) => tail.indexOf(w)).filter((i) => i >= 0);
  const target = moonAt.length && (!marsAt.length || Math.min(...moonAt) < Math.min(...marsAt)) ? "moon" : marsAt.length ? "mars" : null;
  const traits = Object.entries(TRAIT_WORDS).filter(([, words]) => kw(tail, words)).map(([id]) => id);
  return { name, lat, lon, target, traits };
}

function candidateCommand({ en, T, raw, q, selected }) {
  const P = (uk, e) => (en ? e : uk);
  if (!kw(q, ["кандидатур", "candidate"])) return null;
  const create = kw(q, ["оформ", "створи", "створити", "додай", "додати", "запропонуй", "запропонувати", "зроби", "нова ", "нову ", "заповни", "хочу", "create", "add", "submit", "new", "make", "fill", "propose", "register", "want"]);
  const submit = kw(q, SUBMIT_WORDS);
  if (!create && !submit) return null;
  const example = P("«Оформи кандидатуру Долина Смерті 36.5 -117.1 Марс сухість холод»", "“Create candidate Death Valley 36.5 -117.1 Mars aridity cold”");
  const openForm = { type: "candidate", op: "open", label: P("Відкрити форму кандидатури", "Open the candidate form") };
  const parsed = parseCandidate(raw);
  const fromSelection = refersToSelection(q) && selected && parsed.lat === null;
  if (fromSelection) {
    parsed.lat = selected.lat;
    parsed.lon = selected.lon;
    if (!parsed.name) parsed.name = T(selected.name);
  }
  const nothing = !parsed.name && parsed.lat === null;
  if (nothing && submit)
    return { text: P("Запускаю аналіз кандидатури з поточної форми (NASA POWER).", "Running the analysis of the current candidate form (NASA POWER)."), actions: [{ type: "candidate", op: "submit", auto: true }, { type: "candidate", op: "open", label: P("Відкрити результат", "Open the result") }] };
  if (nothing)
    return { text: P(`Для кандидатури потрібні назва, широта й довгота; ціль (Місяць або Марс) та ознаки — за бажанням. Напиши, наприклад: ${example}. Дописавши «оціни», я одразу запущу аналіз.`, `A candidate needs a name, latitude and longitude; the target (Moon or Mars) and traits are optional. For example: ${example}. Add “evaluate” and I’ll run the analysis right away.`), actions: [openForm] };
  const bad = (parsed.lat !== null && Math.abs(parsed.lat) > 90) || (parsed.lon !== null && Math.abs(parsed.lon) > 180);
  if (bad)
    return { text: P("Координати поза межами: широта має бути від −90 до 90, довгота — від −180 до 180. Для південної широти й західної довготи став мінус.", "Coordinates are out of range: latitude must be −90 to 90 and longitude −180 to 180. Use a minus sign for south and west."), actions: [] };
  const missing = [!parsed.name && P("назви", "a name"), (parsed.lat === null || parsed.lon === null) && P("координат (широта й довгота)", "coordinates (latitude and longitude)")].filter(Boolean);
  const target = parsed.target || "mars";
  const draft = {
    ...(parsed.name ? { name: parsed.name } : {}),
    ...(parsed.lat !== null ? { lat: String(parsed.lat) } : {}),
    ...(parsed.lon !== null ? { lon: String(parsed.lon) } : {}),
    target,
    traits: parsed.traits,
  };
  const targetLabel = en ? T(targetName[target]) : targetName[target];
  const traitLabel = parsed.traits.length
    ? parsed.traits.map((id) => T(criteria.find((c) => c.id === id).label)).join(", ")
    : P("не вказано", "none given");
  const summary = P(`«${parsed.name || "—"}», ${parsed.lat ?? "—"}°, ${parsed.lon ?? "—"}°, ціль — ${targetLabel}${parsed.target ? "" : " (за замовчуванням)"}; ознаки: ${traitLabel}.`,
                    `“${parsed.name || "—"}”, ${parsed.lat ?? "—"}°, ${parsed.lon ?? "—"}°, target — ${targetLabel}${parsed.target ? "" : " (default)"}; traits: ${traitLabel}.`);
  if (missing.length)
    return { text: P(`Заповнив форму частково: ${summary} Бракує ${missing.join(" і ")}. Приклад: ${example}.`, `I filled the form partially: ${summary} Missing ${missing.join(" and ")}. Example: ${example}.`), actions: [{ type: "candidate", op: "fill", draft, auto: true }, openForm] };
  const note = P("Кандидатура неперевірена: геологічні ознаки лишаються заявленими, а клімат дає NASA POWER.", "The candidate is unverified: geological traits stay declared, while climate comes from NASA POWER.");
  if (submit)
    return { text: P(`Оформив кандидатуру ${summary} Запускаю аналіз. ${note}`, `Candidate created: ${summary} Running the analysis. ${note}`), actions: [{ type: "candidate", op: "fill", draft, auto: true }, { type: "candidate", op: "submit", draft, auto: true }, { type: "candidate", op: "open", label: P("Відкрити результат", "Open the result") }] };
  return { text: P(`Заповнив форму кандидатури: ${summary} Натисни «Оцінити кандидатуру» або скажи «оціни». ${note}`, `Candidate form filled: ${summary} Press “Evaluate candidate” or say “evaluate”. ${note}`), actions: [{ type: "candidate", op: "fill", draft, auto: true }, { type: "candidate", op: "submit", draft, label: P("Оцінити кандидатуру", "Evaluate candidate") }, openForm] };
}

// Команди виконуються без зовнішньої моделі: вони детерміновані.
export function guideCommand(world, site, messages, lang = "uk", state = {}) {
  const c = context(world, site, messages, lang, state);
  if (QUESTION_START.test(c.q)) return null;
  return candidateCommand(c) || compareCommand(c);
}

// Кнопки-підказки під відповіддю про земну локацію.
export function placeActions(world, site, messages, lang = "uk", state = {}) {
  const c = context(world, site, messages, lang, state);
  const named = findPlaces(c.q).map(({ place }) => place);
  const places = named.length ? named : refersToSelection(c.q) && c.selected ? [c.selected] : [];
  const current = cleanCompareIds(state.compareIds);
  return places
    .filter((place) => earthIds.has(place.id) && !current.includes(place.id))
    .slice(0, 2)
    .map((place) => ({
      type: "compare", op: "add", ids: [place.id],
      label: (c.en ? "⇄ To comparison: " : "⇄ До порівняння: ") + c.T(place.name),
    }));
}

function answerText(world, site, messages, lang) {
  const { en, q, selectedWorld, selected } = context(world, site, messages, lang);

  const named = findPlaces(q);
  if (named.length)
    return named.slice(0, 2).map(({ world: w, place }) => {
      const parts = siteParts(w, place, q, en);
      return parts.length ? parts.join("\n\n") : siteSummary(w, place, en);
    }).join("\n\n");

  if (refersToSelection(q)) {
    if (!selected)
      return en
        ? "No point is selected right now. Pick a marker on the scene or a location in the “Analogs” list, then ask about it with “this location”. I can also answer questions about the whole project."
        : "Зараз жодну точку не вибрано. Обери мітку на сцені або локацію у списку «Аналоги» й запитай про неї словами «ця локація». Я також відповідаю на запитання про весь проєкт.";
    const parts = siteParts(selectedWorld, selected, q, en);
    return parts.length ? parts.join("\n\n") : siteSummary(selectedWorld, selected, en);
  }

  const matched = intents(en).filter((intent) => intent.test(q));
  if (matched.length) {
    const [first, ...rest] = matched;
    const second = rest.find((intent) => !intent.weak && intent !== first);
    return [first, second].filter(Boolean).map((intent) => intent.answer(q)).join("\n\n");
  }

  return en
    ? `The project data has no answer to that, so I won’t guess. I can answer about: the project and the NASA Space Apps challenge, the catalog of ${earth.places.length} Earth analogs and the Moon/Mars points, traits and filters, comparison, new candidates, NASA POWER climate, the map, the 3D scene, sources, languages and technologies. I can also act: “Add Atacama to comparison” or “Create candidate Death Valley 36.5 -117.1 Mars aridity”. Try “Which Earth analogs are there?” or “Where does the data come from?”.`
    : `У даних проєкту немає відповіді на це запитання, тому вигадувати не буду. Я можу розповісти про: проєкт і завдання NASA Space Apps, каталог із ${earth.places.length} земних аналогів і місячні/марсіанські точки, ознаки й фільтри, порівняння, нові кандидатури, клімат NASA POWER, карту, 3D-сцену, джерела, мови й технології. Також виконую команди: «Додай Атакаму до порівняння» чи «Оформи кандидатуру Долина Смерті 36.5 -117.1 Марс сухість». Спробуй: «Які є земні аналоги?» або «Звідки дані?».`;
}

export function guideReply(world, site, messages, lang = "uk", state = {}) {
  return (
    guideCommand(world, site, messages, lang, state) || {
      text: answerText(world, site, messages, lang),
      actions: placeActions(world, site, messages, lang, state),
    }
  );
}

export function localAnswer(world, site, messages, lang = "uk") {
  return guideReply(world, site, messages, lang).text;
}

// Стислий опис даних проєкту для зовнішньої моделі: відповідати лише з нього.
export function projectFacts(world, site) {
  const lines = [
    `ORBITAL — Earth Analog Explorer: проєкт за завданням NASA Space Apps ${challenge.year} «${challenge.title}». 3D-сцена Землі, Місяця, Марса й Сонця, каталог земних аналогів, порівняння ознак, клімат NASA POWER, аналіз кандидатур, карта OpenStreetMap, вкладки: Аналоги, Порівняння, Кандидат, Методика.`,
    `Ознаки: ${criteria.map((item) => `${item.label} (${item.description})`).join("; ")}.`,
    "Фільтри клімату: сухість — середні опади < 1 мм/день; холод — середня температура < 0 °C. Це пороги проєкту, не доказ придатності. Кандидатури неперевірені.",
    "Земні аналоги:",
  ];
  for (const place of earth.places) {
    const s = place.science;
    lines.push(`- ${place.name} (${place.type}; ${place.lat}, ${place.lon}; статус: ${s.status}; для: ${s.targets.join(", ") || "—"}): ${s.summary} Обмеження: ${s.limit}`);
  }
  for (const w of catalog.filter((item) => ["moon", "mars"].includes(item.id)))
    lines.push(`${w.name}: ${w.desc} Точки: ${w.places.map((place) => place.name).join(", ")}.`);
  if (site && world)
    lines.push(`Зараз у інтерфейсі вибрано: ${site.name} (${world.name}).`);
  return lines.join("\n");
}
