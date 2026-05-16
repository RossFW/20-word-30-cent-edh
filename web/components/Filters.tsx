"use client";
import { Filters, TYPE_TOKENS } from "@/lib/cards";

const COLORS: { code: string; label: string }[] = [
  { code: "W", label: "White" },
  { code: "U", label: "Blue" },
  { code: "B", label: "Black" },
  { code: "R", label: "Red" },
  { code: "G", label: "Green" },
  { code: "C", label: "Colorless" },
];

const RARITIES = ["common", "uncommon", "rare", "mythic"];

const SORT_OPTIONS: { value: Filters["sort"]; label: string }[] = [
  { value: "name", label: "Name (A→Z)" },
  { value: "cmc-asc", label: "Mana value (low→high)" },
  { value: "cmc-desc", label: "Mana value (high→low)" },
  { value: "price-asc", label: "Price (low→high)" },
  { value: "price-desc", label: "Price (high→low)" },
  { value: "words-asc", label: "Word count (low→high)" },
  { value: "words-desc", label: "Word count (high→low)" },
  { value: "released-desc", label: "Newest printing" },
  { value: "released-asc", label: "Oldest printing" },
];

export function FiltersPanel({
  filters,
  setFilters,
  availableKeywords,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  availableKeywords: string[];
}) {
  function patch(p: Partial<Filters>) {
    setFilters({ ...filters, ...p });
  }
  function toggleSet(key: "colors" | "types" | "rarities" | "keywords", value: string) {
    const next = new Set(filters[key]);
    next.has(value) ? next.delete(value) : next.add(value);
    setFilters({ ...filters, [key]: next });
  }

  return (
    <aside className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">Search</label>
        <input
          value={filters.query}
          onChange={(e) => patch({ query: e.target.value })}
          placeholder="name, type, rules text..."
          className="w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm placeholder:text-white/30 focus:border-emerald-400 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">Eligibility</label>
        <select
          value={filters.eligibility}
          onChange={(e) => patch({ eligibility: e.target.value as Filters["eligibility"] })}
          className="w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm"
        >
          <option value="ninety_nine">99-eligible (≤20w, ≤$0.30)</option>
          <option value="commander">Commander-eligible</option>
          <option value="any">Any (incl. ineligible)</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">Sort by</label>
        <select
          value={filters.sort}
          onChange={(e) => patch({ sort: e.target.value as Filters["sort"] })}
          className="w-full rounded border border-white/15 bg-black/30 px-2 py-1.5 text-sm"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">Color identity</label>
        <div className="flex flex-wrap gap-1">
          {COLORS.map((c) => {
            const on = filters.colors.has(c.code);
            return (
              <button
                key={c.code}
                onClick={() => toggleSet("colors", c.code)}
                className={`pip ${c.code} ${on ? "ring-2 ring-emerald-400" : "opacity-50"}`}
                title={c.label}
              >
                {c.code}
              </button>
            );
          })}
        </div>
        <select
          value={filters.colorMode}
          onChange={(e) => patch({ colorMode: e.target.value as Filters["colorMode"] })}
          className="mt-2 w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-xs"
        >
          <option value="subset">⊆ identity is within selected (deck-builder mode)</option>
          <option value="exact">= exactly these colors</option>
          <option value="any">∋ contains any of these colors</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">Types</label>
        <div className="flex flex-wrap gap-1">
          {TYPE_TOKENS.map((t) => {
            const on = filters.types.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleSet("types", t)}
                className={`rounded border px-2 py-0.5 text-xs ${on ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : "border-white/15 text-white/70 hover:bg-white/10"}`}
              >
                {t}
              </button>
            );
          })}
        </div>
      </div>

      {availableKeywords.length > 0 && (
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">
            Keywords{" "}
            {filters.keywords.size > 0 && (
              <button
                onClick={() => patch({ keywords: new Set() })}
                className="ml-1 text-[10px] text-white/40 hover:text-white"
              >
                clear
              </button>
            )}
          </label>
          <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto pr-1">
            {availableKeywords.map((k) => {
              const on = filters.keywords.has(k);
              return (
                <button
                  key={k}
                  onClick={() => toggleSet("keywords", k)}
                  className={`rounded border px-1.5 py-0.5 text-[11px] ${on ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : "border-white/15 text-white/70 hover:bg-white/10"}`}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <NumberInput label="Max words" value={filters.maxWords} onChange={(v) => patch({ maxWords: v })} />
        <NumberInput label="Max price" value={filters.maxPrice} onChange={(v) => patch({ maxPrice: v })} step={0.01} />
        <NumberInput label="CMC min" value={filters.cmcMin} onChange={(v) => patch({ cmcMin: v })} />
        <NumberInput label="CMC max" value={filters.cmcMax} onChange={(v) => patch({ cmcMax: v })} />
        <NumberInput label="Power min" value={filters.powerMin} onChange={(v) => patch({ powerMin: v })} />
        <NumberInput label="Power max" value={filters.powerMax} onChange={(v) => patch({ powerMax: v })} />
        <NumberInput label="Tough. min" value={filters.toughnessMin} onChange={(v) => patch({ toughnessMin: v })} />
        <NumberInput label="Tough. max" value={filters.toughnessMax} onChange={(v) => patch({ toughnessMax: v })} />
      </div>

      <div>
        <label className="mb-1 block text-xs uppercase tracking-wide text-white/50">Rarity</label>
        <div className="flex flex-wrap gap-1">
          {RARITIES.map((r) => {
            const on = filters.rarities.has(r);
            return (
              <button
                key={r}
                onClick={() => toggleSet("rarities", r)}
                className={`rounded border px-2 py-0.5 text-xs capitalize ${on ? "border-emerald-400 bg-emerald-500/20 text-emerald-200" : "border-white/15 text-white/70 hover:bg-white/10"}`}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] uppercase tracking-wide text-white/50">{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full rounded border border-white/15 bg-black/30 px-2 py-1 text-sm focus:border-emerald-400 focus:outline-none"
      />
    </label>
  );
}
