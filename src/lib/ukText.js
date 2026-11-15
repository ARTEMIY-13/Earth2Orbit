// Підготовка тексту для українського синтезу мовлення: числа словами,
// латиниця кирилицею, символи одиниць — словами. Модель знає лише кирилицю
// й базову пунктуацію, тож усе інше інакше просто пропало б.

const ONES = ["нуль", "один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
const ONES_F = ["нуль", "одна", "дві", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять"];
const TEENS = ["десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять", "п'ятнадцять", "шістнадцять", "сімнадцять", "вісімнадцять", "дев'ятнадцять"];
const TENS = ["", "", "двадцять", "тридцять", "сорок", "п'ятдесят", "шістдесят", "сімдесят", "вісімдесят", "дев'яносто"];
const HUNDREDS = ["", "сто", "двісті", "триста", "чотириста", "п'ятсот", "шістсот", "сімсот", "вісімсот", "дев'ятсот"];

function below1000(n, feminine = false) {
  const words = [];
  const h = Math.floor(n / 100),
    r = n % 100;
  if (h) words.push(HUNDREDS[h]);
  if (r >= 10 && r < 20) words.push(TEENS[r - 10]);
  else {
    if (Math.floor(r / 10)) words.push(TENS[Math.floor(r / 10)]);
    if (r % 10) words.push((feminine ? ONES_F : ONES)[r % 10]);
  }
  return words;
}
const plural = (n, [one, few, many]) => {
  const r10 = n % 10,
    r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return one;
  if (r10 >= 2 && r10 <= 4 && (r100 < 10 || r100 >= 20)) return few;
  return many;
};

export function ukrainianNumber(value) {
  let n = Math.floor(Math.abs(Number(value)));
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "нуль";
  if (n >= 1e9) return String(value).split("").map((d) => ONES[d] ?? "").join(" ");
  const words = [];
  const millions = Math.floor(n / 1e6);
  if (millions) words.push(...below1000(millions), plural(millions, ["мільйон", "мільйони", "мільйонів"]));
  n %= 1e6;
  const thousands = Math.floor(n / 1000);
  if (thousands) words.push(...below1000(thousands, true), plural(thousands, ["тисяча", "тисячі", "тисяч"]));
  n %= 1000;
  if (n) words.push(...below1000(n));
  return words.join(" ");
}

function numberToWords(text) {
  const negative = text.startsWith("-") || text.startsWith("−");
  const clean = text.replace(/^[-−]/, "");
  const [int, frac] = clean.split(/[.,]/);
  let words = ukrainianNumber(int);
  if (frac) {
    const trimmed = frac.replace(/0+$/, "") || "0";
    const zeros = trimmed.match(/^0*/)[0].length;
    const rest = trimmed.slice(zeros);
    words +=
      " кома " +
      (trimmed.length <= 3
        ? [..."0".repeat(Math.min(zeros, trimmed.length - (rest ? 0 : 1)))].map(() => "нуль").concat(rest ? [ukrainianNumber(rest)] : ["нуль"]).join(" ")
        : trimmed.split("").map((d) => ONES[d]).join(" "));
  }
  return (negative ? "мінус " : "") + words;
}

const LATIN = {
  a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "і", j: "дж", k: "к", l: "л", m: "м",
  n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "і", z: "з",
};
const WORDS = {
  ori: "орі", orbital: "орбітал", nasa: "наса", esa: "іса", power: "пауер", api: "а пе і", ai: "штучний інтелект",
  json: "джейсон", openstreetmap: "оупен стріт меп", leaflet: "ліфлет", github: "ґітхаб", pages: "пейджес",
  react: "ріект", three: "трі", js: "джей ес", node: "ноуд", lroc: "елрок", jpl: "джей пі ел", mola: "мола",
  lola: "лола", hirise: "хайрайз", merra: "мерра", gpt: "джі пі ті",
};
function latinWord(word) {
  const lower = word.toLowerCase();
  if (WORDS[lower]) return WORDS[lower];
  let out = lower
    .replace(/sh/g, "ш")
    .replace(/ch/g, "ч")
    .replace(/th/g, "т")
    .replace(/oo/g, "у")
    .replace(/ee/g, "і")
    .replace(/ph/g, "ф");
  return out.replace(/[a-z]/g, (ch) => LATIN[ch] ?? "");
}

export function normalizeUk(text) {
  return String(text)
    .replace(/[«»"“”„]/g, "")
    .replace(/[’ʼ`]/g, "'")
    .replace(/…/g, ".")
    .replace(/[·•|/]/g, ", ")
    .replace(/[–]/g, "—")
    .replace(/\s*→\s*/g, ". ")
    .replace(/°\s*C/g, " градусів Цельсія")
    .replace(/°/g, " градусів")
    .replace(/%/g, " відсотків")
    .replace(/(?<!\p{L})км(?!\p{L})/gu, "кілометрів")
    .replace(/(?<!\p{L})мм(?!\p{L})/gu, "міліметрів")
    .replace(/(?<!\p{L})мбар(?!\p{L})/gu, "мілібар")
    .replace(/[-−]?\d+(?:[.,]\d+)?/g, (m) => " " + numberToWords(m) + " ")
    .replace(/[A-Za-z]+/g, latinWord)
    .replace(/[()[\]{}]/g, ", ")
    .replace(/\s+([,.!?:;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
