import catalogue from "./settings-catalogue.json";

const zones = new Set(catalogue.zone.split(" "));
const currencies = new Set(catalogue.currency.split(" "));
const languages = new Set(catalogue.language.split(" "));
const regions = new Set(catalogue.region.split(" "));
const edgeSpaces = (s: string) => s.replace(/^ +| +$/g, "");
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
function keys(v: unknown, allowed: string[]): v is Record<string, unknown> {
  return record(v) && Object.keys(v).every(k => allowed.includes(k));
}

function safeText(value: unknown, limit: number) {
  if (typeof value !== "string") return null;
  const v = edgeSpaces(value.normalize("NFC"));
  if (!v || [...v].length > limit || /[\p{Cc}\p{Cs}\p{Bidi_Control}\u2028\u2029<>{}]/u.test(v)
    || /^\p{White_Space}|\p{White_Space}$/u.test(v)) return null;
  return v;
}

export function settingsInput(value: unknown) {
  if (!keys(value, ["expected_revision", "settings"])) return null;
  const r = value.expected_revision;
  if (typeof r !== "number" || !Number.isInteger(r) || r < 0 || r > 2147483646) return null;
  const s = value.settings;
  if (!keys(s, ["display_name","timezone","default_locale","default_currency","terminology"])) return null;
  const name = safeText(s.display_name, 120);
  const zone = typeof s.timezone === "string" && edgeSpaces(s.timezone);
  const locale = typeof s.default_locale === "string" && edgeSpaces(s.default_locale);
  const rawCurrency = typeof s.default_currency === "string" && edgeSpaces(s.default_currency);
  if (!name || !zone || !zones.has(zone) || !locale || !/^[a-zA-Z]{2,3}(-[a-zA-Z]{2})?$/.test(locale)
    || !rawCurrency || !/^[a-zA-Z]{3}$/.test(rawCurrency)) return null;
  const [lang, region] = locale.split("-");
  const currency = rawCurrency.toUpperCase();
  if (!languages.has(lang.toLowerCase()) || (region && !regions.has(region.toUpperCase())) || !currencies.has(currency)) return null;
  let singular = null, plural = null;
  if ("terminology" in s) {
    if (!keys(s.terminology, ["staff_member"])) return null;
    if ("staff_member" in s.terminology) {
      const pair = s.terminology.staff_member;
      if (!keys(pair, ["singular","plural"])) return null;
      singular = safeText(pair.singular, 40);
      plural = safeText(pair.plural, 40);
      if (!singular || !plural) return null;
    }
  }
  return { expected_revision: r, display_name: name, timezone: zone,
    default_locale: lang.toLowerCase() + (region ? "-" + region.toUpperCase() : ""),
    default_currency: currency, staff_member_singular: singular, staff_member_plural: plural };
}

