import { worlds } from "./worlds.js";
export const challenge = {
  title:
    "Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars",
  url: "https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/",
  year: 2026,
};
export const methodologySource =
  "https://science.nasa.gov/solar-system/planetary-analogs/10-things-to-know-about-planetary-analogs/";
export const criteria = [
  {
    id: "aridity",
    label: "Сухість",
    description: "Сухі ґрунти та низькі опади",
  },
  { id: "cold", label: "Холод", description: "Полярні та холодні середовища" },
  {
    id: "impact",
    label: "Ударна геологія",
    description: "Кратери та ударні структури",
  },
  {
    id: "basalt",
    label: "Вулканізм",
    description: "Базальти й вулканічний рельєф",
  },
  {
    id: "caves",
    label: "Печери",
    description: "Лавові трубки й підземні маршрути",
  },
  {
    id: "isolation",
    label: "Ізоляція",
    description: "Віддалені польові операції",
  },
  {
    id: "robotics",
    label: "Робототехніка",
    description: "Польові випробування приладів і роверів",
  },
  {
    id: "astrobiology",
    label: "Астробіологія",
    description: "Зразки ґрунту та пошук біосигнатур",
  },
];
const evidence = {
  "earth-0": {
    targets: ["mars"],
    types: ["geologic", "astrobiology"],
    traits: ["aridity", "robotics", "astrobiology"],
    status: "reference",
    organization: "NASA / JPL",
    summary:
      "Польові випробування Chemical Laptop і дослідження сухих ґрунтів для пошуку біосигнатур.",
    uses: ["Аналіз ґрунту", "Пошук біосигнатур", "Перевірка приладів"],
    limit:
      "Земна атмосфера, гравітація й біологічні процеси відрізняються від марсіанських.",
    sources: [
      {
        title: "Chemical Laptop в Атакамі",
        url: "https://www.jpl.nasa.gov/news/detecting-life-in-the-ultra-dry-atacama-desert/",
      },
    ],
  },
  "earth-1": {
    targets: ["mars"],
    types: ["geologic", "mission"],
    traits: ["cold", "impact", "isolation"],
    status: "reference",
    organization: "NASA Earth Observatory",
    summary:
      "Haughton-Mars Project досліджує полярну пустелю, ударну геологію та віддалені експедиційні операції.",
    uses: ["Ударна геологія", "Польові маршрути", "Віддалена експедиція"],
    limit:
      "Окремі геологічні й операційні умови подібні. Точні властивості конкретного майданчика потребують польових даних.",
    sources: [
      {
        title: "Haughton-Mars Project",
        url: "https://science.nasa.gov/earth/earth-observatory/mars-researchers-rendezvous-on-remote-arctic-island-2585/",
      },
    ],
  },
  "earth-2": {
    targets: ["mars"],
    types: ["geologic", "astrobiology"],
    traits: ["aridity", "cold", "astrobiology"],
    status: "reference",
    organization: "NASA",
    summary:
      "Сухі долини Мак-Мердо використовують для дослідження полярних ґрунтів, льоду й умов збереження життя.",
    uses: ["Полярні ґрунти", "Підповерхневий лід", "Випробування приладів"],
    limit: "Аналогія найбільш доречна для окремих полярних умов Марса.",
    sources: [
      {
        title: "Сухі долини Антарктики",
        url: "https://www.nasa.gov/image-article/dry-valleys-antarctica/",
      },
      {
        title: "Phoenix Antarctic dry-valley analog",
        url: "https://ntrs.nasa.gov/citations/20100003844",
      },
    ],
  },
  "earth-3": {
    targets: ["moon", "mars"],
    types: ["geologic", "mission"],
    traits: ["basalt", "astrobiology"],
    status: "reference",
    organization: "NASA BASALT",
    summary:
      "На лавових полях Кілауеа NASA BASALT перевіряв геологічні маршрути, відбір зразків і взаємодію із затримкою зв’язку.",
    uses: ["Зразки базальтів", "Польова наука", "Процедури зв’язку"],
    limit:
      "Тут показані лавові поля Кілауеа. Ізоляційний комплекс HI-SEAS на Мауна-Лоа є іншим майданчиком.",
    sources: [
      {
        title: "NASA BASALT",
        url: "https://www.nasa.gov/missions/analog-field-testing/what-is-basalt/",
      },
    ],
  },
  "earth-4": {
    targets: ["mars"],
    types: ["geologic", "robotics"],
    traits: ["aridity", "robotics"],
    status: "reference",
    organization: "NASA / JPL",
    summary:
      "У регіоні Мохаве JPL випробовував PUFFER на схилах осадових порід і під нависаннями Rainbow Basin.",
    uses: ["Прохідність роботів", "Робота на схилах", "Осадові породи"],
    limit:
      "Точка на карті є регіональним орієнтиром, а не координатами конкретного випробування.",
    sources: [
      {
        title: "Польові випробування PUFFER",
        url: "https://www.jpl.nasa.gov/news/origami-inspired-robot-can-hitch-a-ride-with-a-rover/",
      },
    ],
  },
  "earth-5": {
    targets: ["moon"],
    types: ["geologic", "mission"],
    traits: ["basalt"],
    status: "reference",
    organization: "NASA Artemis",
    summary:
      "NASA документує підготовку екіпажу Artemis II в Ісландії — розпізнавання порід, навігацію та відбір зразків.",
    uses: ["Місячна польова геологія", "Навігація", "Відбір зразків"],
    limit:
      "Подібні породи можуть утворюватися різними процесами, зокрема вулканічними на Землі та ударними на Місяці.",
    sources: [
      {
        title: "Artemis II — тренування в Ісландії",
        url: "https://science.nasa.gov/missions/artemis/nasas-artemis-ii-crew-uses-iceland-terrain-for-lunar-training/",
      },
    ],
  },
  "earth-8": {
    targets: ["mars"],
    types: ["geologic"],
    traits: ["aridity"],
    status: "landscape",
    organization: "NASA Earth Observatory",
    summary:
      "Посушливий ландшафт Ваді-Рам має піщані долини та масиви пісковику й граніту.",
    uses: ["Порівняння ландшафтів", "Польові сценарії"],
    limit:
      "Джерело NASA описує ландшафт. Воно не підтверджує власні польові випробування NASA на цій точці.",
    sources: [
      {
        title: "Ландшафт Ваді-Рам",
        url: "https://science.nasa.gov/earth/earth-observatory/wadi-rum-jordan-49945/",
      },
    ],
  },
  "earth-10": {
    targets: ["moon", "mars"],
    types: ["geologic", "mission"],
    traits: ["basalt", "caves"],
    status: "reference",
    organization: "ESA PANGAEA",
    summary:
      "ESA PANGAEA використовує вулканічні ландшафти Лансароте для геологічного навчання, роботи з лавовими тунелями та відбору зразків.",
    uses: ["Вулканічна геологія", "Лавові тунелі", "Відбір зразків"],
    limit:
      "Можливість використання конкретного тунелю для поселення потребує окремого інженерного дослідження.",
    sources: [
      {
        title: "ESA PANGAEA",
        url: "https://www.esa.int/articles/what-is-pangaea",
      },
    ],
  },
};
export const catalog = worlds.map((world) => ({
  ...world,
  places: world.places.map((place) => ({
    ...place,
    science:
      world.id === "earth"
        ? evidence[place.id] || {
            targets: [],
            types: [],
            traits: [],
            status: "candidate",
            organization: null,
            summary:
              "Попередня ландшафтна кандидатура з початкового каталогу. Потрібні геологічні джерела й польова перевірка.",
            uses: [],
            limit: "Статус і характеристики аналога потребують підтвердження.",
            sources: [],
          }
        : null,
  })),
}));
export const earthSites = catalog[0].places;
export const evidenceLabels = {
  reference: "Документований аналог",
  landscape: "Ландшафтні дані",
  candidate: "Потребує перевірки",
};
export function filterAnalogs(
  sites,
  { target = "all", traits = [], query = "" } = {},
) {
  const text = query.trim().toLocaleLowerCase("uk");
  return sites
    .filter(
      (site) =>
        (target === "all" || site.science.targets.includes(target)) &&
        (!text ||
          (site.name + " " + site.description)
            .toLocaleLowerCase("uk")
            .includes(text)) &&
        traits.every((trait) => site.science.traits.includes(trait)),
    )
    .map((site) => ({
      ...site,
      matchedTraits: traits.filter((trait) =>
        site.science.traits.includes(trait),
      ),
    }));
}
