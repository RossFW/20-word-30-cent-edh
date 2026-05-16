"use client";
import { useEffect, useMemo, useState } from "react";
import { loadCards, applyFilters, EMPTY_FILTERS, topKeywords, type Filters } from "@/lib/cards";
import type { Card } from "@/lib/types";
import { FiltersPanel } from "@/components/Filters";
import { CardTile } from "@/components/CardTile";

const PAGE_SIZE = 60;

export default function BrowsePage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    loadCards().then(setCards);
  }, []);

  const filtered = useMemo(() => {
    if (!cards) return [];
    return applyFilters(cards, filters);
  }, [cards, filters]);

  const keywords = useMemo(() => (cards ? topKeywords(cards, 40) : []), [cards]);

  useEffect(() => setVisible(PAGE_SIZE), [filters]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
      <FiltersPanel filters={filters} setFilters={setFilters} availableKeywords={keywords} />
      <div>
        <div className="mb-3 flex items-baseline justify-between text-sm text-white/70">
          <span>
            {cards == null
              ? "Loading card pool..."
              : `${filtered.length.toLocaleString()} card${filtered.length === 1 ? "" : "s"}`}
          </span>
          <span className="text-xs text-white/40">
            Showing {Math.min(visible, filtered.length).toLocaleString()}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.slice(0, visible).map((c) => (
            <CardTile key={`${c.name}-${c.set}-${c.collector_number}`} card={c} />
          ))}
        </div>

        {visible < filtered.length && (
          <button
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="mx-auto mt-6 block rounded border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
          >
            Load {Math.min(PAGE_SIZE, filtered.length - visible)} more
          </button>
        )}
      </div>
    </div>
  );
}
