import type { Card } from "./types";

let cache: Card[] | null = null;

const ASSET_PREFIX = process.env.NEXT_PUBLIC_BASE_PATH || "";

export async function loadCards(): Promise<Card[]> {
  if (cache) return cache;
  // "no-cache" forces the browser to revalidate with the server via ETag/If-None-Match.
  // Without this, after a nightly data refresh the user's browser may serve a stale
  // cards.json from disk cache and miss newly-added fields (e.g. edhrec_rank).
  const res = await fetch(`${ASSET_PREFIX}/cards.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`failed to load cards.json (${res.status})`);
  cache = (await res.json()) as Card[];
  return cache;
}

export type SortKey =
  | "name"
  | "edhrec"
  | "cmc-asc"
  | "cmc-desc"
  | "price-asc"
  | "price-desc"
  | "words-asc"
  | "words-desc"
  | "released-desc"
  | "released-asc";

export type Filters = {
  nameQuery: string;
  textQuery: string;
  colors: Set<string>;
  colorMode: "exact" | "subset" | "any";
  types: Set<string>;
  keywords: Set<string>;
  maxWords: number | null;
  maxPrice: number | null;
  cmcMin: number | null;
  cmcMax: number | null;
  powerMin: number | null;
  powerMax: number | null;
  toughnessMin: number | null;
  toughnessMax: number | null;
  rarities: Set<string>;
  eligibility: "any" | "ninety_nine" | "commander";
  sort: SortKey;
};

export const EMPTY_FILTERS: Filters = {
  nameQuery: "",
  textQuery: "",
  colors: new Set(),
  colorMode: "subset",
  types: new Set(),
  keywords: new Set(),
  maxWords: null,
  maxPrice: null,
  cmcMin: null,
  cmcMax: null,
  powerMin: null,
  powerMax: null,
  toughnessMin: null,
  toughnessMax: null,
  rarities: new Set(),
  eligibility: "ninety_nine",
  sort: "edhrec",
};

const TYPE_TOKENS = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Land", "Planeswalker", "Battle"];

/** Some Scryfall power/toughness values are non-numeric ("*", "1+*", "X").
 * We coerce to number where possible and skip the range check otherwise. */
function ptNum(v: string | null): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function topKeywords(cards: Card[], limit = 40): string[] {
  const counts = new Map<string, number>();
  for (const c of cards) {
    if (!c.ninety_nine_eligible) continue;
    for (const k of c.keywords) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

export function applyFilters(cards: Card[], f: Filters): Card[] {
  const nq = f.nameQuery.trim().toLowerCase();
  const tq = f.textQuery.trim().toLowerCase();
  const out = cards.filter((c) => {
    if (f.eligibility === "ninety_nine" && !c.ninety_nine_eligible) return false;
    if (f.eligibility === "commander" && !c.commander_eligible) return false;

    if (nq && !c.name.toLowerCase().includes(nq)) return false;
    if (tq && !c.oracle_text.toLowerCase().includes(tq)) return false;

    if (f.colors.size > 0) {
      const ci = new Set(c.color_identity);
      if (f.colorMode === "exact") {
        if (ci.size !== f.colors.size) return false;
        for (const col of f.colors) if (!ci.has(col)) return false;
      } else if (f.colorMode === "subset") {
        for (const col of ci) if (!f.colors.has(col)) return false;
      } else if (f.colorMode === "any") {
        let found = false;
        for (const col of f.colors) if (ci.has(col)) { found = true; break; }
        if (!found) return false;
      }
    }

    if (f.types.size > 0) {
      let match = false;
      for (const t of f.types) {
        if (c.type_line.includes(t)) { match = true; break; }
      }
      if (!match) return false;
    }

    if (f.keywords.size > 0) {
      // A card must have *all* selected keywords (AND, matches Scryfall behavior for keyword:)
      const set = new Set(c.keywords);
      for (const k of f.keywords) if (!set.has(k)) return false;
    }

    if (f.rarities.size > 0 && !f.rarities.has(c.rarity)) return false;

    if (f.maxWords !== null && c.word_count > f.maxWords) return false;
    if (f.maxPrice !== null && (c.price_min ?? Infinity) > f.maxPrice) return false;
    if (f.cmcMin !== null && c.cmc < f.cmcMin) return false;
    if (f.cmcMax !== null && c.cmc > f.cmcMax) return false;

    const p = ptNum(c.power);
    const t = ptNum(c.toughness);
    if (f.powerMin !== null && (p === null || p < f.powerMin)) return false;
    if (f.powerMax !== null && (p === null || p > f.powerMax)) return false;
    if (f.toughnessMin !== null && (t === null || t < f.toughnessMin)) return false;
    if (f.toughnessMax !== null && (t === null || t > f.toughnessMax)) return false;

    return true;
  });

  const cmp = compareBySort(f.sort);
  if (cmp) out.sort(cmp);
  return out;
}

function compareBySort(s: SortKey): ((a: Card, b: Card) => number) | null {
  switch (s) {
    case "name":
      return (a, b) => a.name.localeCompare(b.name);
    case "edhrec":
      // EDHREC rank: lower number = more popular. Unranked sinks to the bottom.
      return (a, b) => {
        const ar = a.edhrec_rank ?? Number.POSITIVE_INFINITY;
        const br = b.edhrec_rank ?? Number.POSITIVE_INFINITY;
        return ar - br || a.name.localeCompare(b.name);
      };
    case "cmc-asc":
      return (a, b) => (a.cmc ?? 0) - (b.cmc ?? 0) || a.name.localeCompare(b.name);
    case "cmc-desc":
      return (a, b) => (b.cmc ?? 0) - (a.cmc ?? 0) || a.name.localeCompare(b.name);
    case "price-asc":
      return (a, b) => (a.price_min ?? Infinity) - (b.price_min ?? Infinity) || a.name.localeCompare(b.name);
    case "price-desc":
      return (a, b) => (b.price_min ?? -Infinity) - (a.price_min ?? -Infinity) || a.name.localeCompare(b.name);
    case "words-asc":
      return (a, b) => a.word_count - b.word_count || a.name.localeCompare(b.name);
    case "words-desc":
      return (a, b) => b.word_count - a.word_count || a.name.localeCompare(b.name);
    case "released-desc":
      return (a, b) => (b.released_at ?? "").localeCompare(a.released_at ?? "") || a.name.localeCompare(b.name);
    case "released-asc":
      return (a, b) => (a.released_at ?? "").localeCompare(b.released_at ?? "") || a.name.localeCompare(b.name);
    default:
      return null;
  }
}

export { TYPE_TOKENS };
