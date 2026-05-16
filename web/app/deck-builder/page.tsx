"use client";
import { useEffect, useMemo, useState } from "react";
import { loadCards, applyFilters, EMPTY_FILTERS, topKeywords, type Filters } from "@/lib/cards";
import type { Card, Deck } from "@/lib/types";
import {
  emptyDeck,
  loadDeck,
  saveDeck,
  addToDeck,
  removeOne,
  totalCards,
  validate,
  exportText,
  encodeDeckHash,
  decodeDeckHash,
  parseDecklistText,
} from "@/lib/deck";
import { FiltersPanel } from "@/components/Filters";
import { CardTile } from "@/components/CardTile";

export default function DeckBuilderPage() {
  const [cards, setCards] = useState<Card[] | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [deck, setDeck] = useState<Deck>(emptyDeck());
  const [toast, setToast] = useState<string | null>(null);
  const [visible, setVisible] = useState(40);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importIssues, setImportIssues] = useState<{ unknown: string[]; warnings: string[] } | null>(null);

  // Initial load: cards first, then deck (preferring URL hash > localStorage > empty).
  useEffect(() => {
    loadCards().then(setCards);
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.startsWith("#d=")) {
      const decoded = decodeDeckHash(hash);
      if (decoded) {
        setDeck(decoded);
        return;
      }
    }
    setDeck(loadDeck());
  }, []);
  useEffect(() => saveDeck(deck), [deck]);

  // Mirror deck state into URL hash (debounced) so the URL is shareable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handle = setTimeout(() => {
      const encoded = encodeDeckHash(deck);
      const hasContent = deck.commander || deck.ninety_nine.length > 0;
      const newHash = hasContent ? `#d=${encoded}` : "";
      if (window.location.hash !== newHash) {
        history.replaceState(null, "", `${window.location.pathname}${window.location.search}${newHash}`);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [deck]);

  const byName = useMemo(() => {
    const m = new Map<string, Card>();
    if (cards) for (const c of cards) m.set(c.name, c);
    return m;
  }, [cards]);

  const keywords = useMemo(() => (cards ? topKeywords(cards, 40) : []), [cards]);

  const commanderCard = deck.commander ? byName.get(deck.commander) : null;
  const effectiveFilters = useMemo<Filters>(() => {
    if (!commanderCard) return filters;
    if (filters.colors.size > 0) return filters;
    const next = new Set(commanderCard.color_identity);
    if (next.size === 0) next.add("C");
    return { ...filters, colors: next, colorMode: "subset" };
  }, [filters, commanderCard]);

  const filtered = useMemo(() => (cards ? applyFilters(cards, effectiveFilters) : []), [cards, effectiveFilters]);
  useEffect(() => setVisible(40), [effectiveFilters]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of deck.ninety_nine) m.set(s.name, s.count);
    return m;
  }, [deck]);

  const issues = useMemo(() => validate(deck, byName), [deck, byName]);
  const total = totalCards(deck);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  function handleAdd(card: Card) {
    const r = addToDeck(deck, card);
    setDeck(r.deck);
    if (r.error) showToast(r.error);
  }
  function handleSetCommander(card: Card) {
    if (deck.commander === card.name) return;
    setDeck({ ...deck, commander: card.name });
    showToast(`Commander: ${card.name}`);
  }

  function copyShareLink() {
    const url = `${window.location.origin}${window.location.pathname}#d=${encodeDeckHash(deck)}`;
    navigator.clipboard.writeText(url);
    showToast("Share link copied to clipboard");
  }

  function doImport() {
    const parsed = parseDecklistText(importText, byName);
    setDeck(parsed.deck);
    setImportIssues({ unknown: parsed.unknown, warnings: parsed.warnings });
    const total = (parsed.deck.commander ? 1 : 0) + parsed.deck.ninety_nine.reduce((s, x) => s + x.count, 0);
    showToast(`Imported ${total} card${total === 1 ? "" : "s"}`);
    if (parsed.unknown.length === 0 && parsed.warnings.length === 0) {
      setImportOpen(false);
      setImportText("");
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr_360px]">
      <FiltersPanel filters={filters} setFilters={setFilters} availableKeywords={keywords} />

      <div>
        <div className="mb-3 flex items-baseline justify-between text-sm text-white/70">
          <span>{filtered.length.toLocaleString()} cards match</span>
          {commanderCard && filters.colors.size === 0 && (
            <span className="text-xs text-emerald-300">
              Auto-filtered to commander's identity ({commanderCard.color_identity.join("") || "C"}).
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.slice(0, visible).map((c) => (
            <CardTile
              key={`${c.name}-${c.set}-${c.collector_number}`}
              card={c}
              onAdd={handleAdd}
              onSetCommander={handleSetCommander}
              inDeck={counts.get(c.name)}
            />
          ))}
        </div>
        {visible < filtered.length && (
          <button
            onClick={() => setVisible((v) => v + 40)}
            className="mx-auto mt-6 block rounded border border-white/15 px-4 py-2 text-sm hover:bg-white/10"
          >
            Load more
          </button>
        )}
      </div>

      <aside className="space-y-3 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Deck</h2>
          <span className={`text-sm ${total === 100 ? "text-emerald-300" : "text-white/60"}`}>
            {total} / 100
          </span>
        </div>

        {deck.commander ? (
          <div className="rounded border border-emerald-400/50 bg-emerald-500/10 p-2">
            <div className="text-[10px] uppercase tracking-wide text-emerald-300">Commander</div>
            <div className="flex items-center justify-between">
              <span className="font-medium">{deck.commander}</span>
              <button
                onClick={() => setDeck({ ...deck, commander: null })}
                className="text-xs text-white/50 hover:text-red-300"
              >
                clear
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded border border-white/15 bg-white/5 p-2 text-sm text-white/60">
            No commander. Pick a legendary creature from the browse list.
          </div>
        )}

        <div className="max-h-[50vh] overflow-auto rounded border border-white/10">
          {deck.ninety_nine.length === 0 ? (
            <div className="p-3 text-sm text-white/40">Empty. Add cards from the left.</div>
          ) : (
            <ul className="divide-y divide-white/10">
              {[...deck.ninety_nine]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((s) => {
                  const c = byName.get(s.name);
                  return (
                    <li key={s.name} className="flex items-center justify-between gap-2 px-2 py-1 text-sm">
                      <span className="truncate">
                        {s.count > 1 ? `${s.count}× ` : ""}
                        {s.name}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-white/50">
                        <span>{c?.word_count ?? "?"}w</span>
                        <button
                          onClick={() => setDeck(removeOne(deck, s.name))}
                          className="rounded px-1 text-white/40 hover:bg-red-500/30 hover:text-red-200"
                        >
                          ✕
                        </button>
                      </span>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>

        {issues.length > 0 && (
          <ul className="max-h-32 space-y-1 overflow-auto text-xs">
            {issues.map((i, idx) => (
              <li key={idx} className={i.kind === "error" ? "text-red-300" : "text-amber-300"}>
                • {i.message}
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              navigator.clipboard.writeText(exportText(deck));
              showToast("Decklist copied to clipboard");
            }}
            className="rounded bg-emerald-500/20 px-2 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-500/40"
          >
            Copy decklist
          </button>
          <button
            onClick={copyShareLink}
            className="rounded bg-sky-500/20 px-2 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/40"
          >
            Copy share link
          </button>
          <button
            onClick={() => {
              setImportText("");
              setImportIssues(null);
              setImportOpen(true);
            }}
            className="rounded border border-white/15 px-2 py-1.5 text-xs hover:bg-white/10"
          >
            Import decklist
          </button>
          <button
            onClick={() => {
              if (confirm("Reset deck?")) setDeck(emptyDeck());
            }}
            className="rounded border border-white/15 px-2 py-1.5 text-xs hover:bg-white/10"
          >
            Reset
          </button>
        </div>
      </aside>

      {importOpen && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-4" onClick={() => setImportOpen(false)}>
          <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-[#11111a] p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-lg font-semibold">Import decklist</h3>
            <p className="mb-3 text-xs text-white/60">
              Paste a decklist from Moxfield, Archidekt, Arena, Scryfall, etc.
              Format: <code>1 Lightning Bolt</code> or <code>1x Lightning Bolt (M11) 149</code>.
              Mark the commander with <code>// Commander</code> on its own line, or <code>*CMDR*</code> after the name.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={14}
              placeholder={"// Commander\n1 Sasaya, Orochi Ascendant\n\n1 Sol Ring\n1 Llanowar Elves\n..."}
              className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 font-mono text-sm focus:border-emerald-400 focus:outline-none"
            />
            {importIssues && (importIssues.unknown.length > 0 || importIssues.warnings.length > 0) && (
              <div className="mt-2 max-h-32 overflow-auto rounded border border-amber-400/30 bg-amber-500/10 p-2 text-xs text-amber-200">
                {importIssues.unknown.length > 0 && (
                  <div>
                    <strong>Unknown cards ({importIssues.unknown.length}):</strong>{" "}
                    {importIssues.unknown.slice(0, 10).join(", ")}
                    {importIssues.unknown.length > 10 && ` (+${importIssues.unknown.length - 10} more)`}
                  </div>
                )}
                {importIssues.warnings.map((w, i) => <div key={i}>{w}</div>)}
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => setImportOpen(false)}
                className="rounded border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={doImport}
                disabled={!importText.trim()}
                className="rounded bg-emerald-500/30 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/50 disabled:opacity-40"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-black/80 px-4 py-2 text-sm shadow-lg ring-1 ring-white/10">
          {toast}
        </div>
      )}
    </div>
  );
}
