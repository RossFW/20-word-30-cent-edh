"""Join the cardpool with Scryfall bulk data, score word count, tag eligibility.

Outputs:
  data/cards.json    -- one entry per pool card, normalized for the site
  data/stats.json    -- counts/breakdowns for the README + sanity-check

Eligibility rules for THIS format:
  - 99-eligible: word_count <= 20 AND price <= $0.30 AND not on banlist
                 AND not a Conspiracy / scheme / vanguard / token / digital card
  - commander-eligible: Scryfall says it's commander-legal in EDH (we map this
                        from the `type_line` + the `oracle_text`'s "can be
                        your commander" line) AND price <= $0.30
                        AND not on banlist
"""

from __future__ import annotations

import json
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from word_count import count_words, explain  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BULK_PATH = ROOT / "pipeline" / "scryfall_bulk.json"
CARDPOOL_PATH = ROOT / "data" / "cardpool.json"
BANLIST_PATH = ROOT / "data" / "banlist.json"
OUT_CARDS = ROOT / "data" / "cards.json"
OUT_STATS = ROOT / "data" / "stats.json"

PRICE_CAP = 0.30
WORD_CAP = 20

# Layouts that aren't real cards in EDH.
EXCLUDED_LAYOUTS = {
    "token", "double_faced_token", "emblem", "art_series",
    "vanguard", "scheme", "planar", "augment", "host",
    "double_sided",  # rare promo type, not playable in Constructed
}

CAN_BE_COMMANDER_RE = re.compile(r"can be your commander", re.IGNORECASE)


def load_bulk() -> list[dict]:
    print(f"loading {BULK_PATH} ...")
    t0 = time.time()
    with BULK_PATH.open() as f:
        data = json.load(f)
    print(f"  loaded {len(data):,} card-printings in {time.time()-t0:.1f}s")
    return data


def normalize_name(name: str) -> str:
    """Case-fold and collapse whitespace for matching across data sources."""
    return re.sub(r"\s+", " ", name).strip().casefold()


def usd(price: str | None) -> float | None:
    if price in (None, "", "null"):
        return None
    try:
        return float(price)
    except (TypeError, ValueError):
        return None


def pick_best_printing(printings: list[dict]) -> dict | None:
    """For a card with multiple printings, pick the one that best represents the
    format-legal version: lowest USD price (TCGPlayer non-foil) at-or-under the
    price cap, falling back to lowest price overall if none qualify."""
    scored = []
    for p in printings:
        prices = p.get("prices") or {}
        non_foil = usd(prices.get("usd"))
        foil = usd(prices.get("usd_foil"))
        etched = usd(prices.get("usd_etched"))
        # Cheapest available non-foil first; foil/etched as fallback.
        candidates = [x for x in (non_foil, foil, etched) if x is not None]
        cheap = min(candidates) if candidates else None
        scored.append((cheap, p, non_foil))

    # Prefer non-foil <= cap; then any <= cap; then cheapest of any.
    under_cap_nonfoil = [(c, p) for c, p, nf in scored if nf is not None and nf <= PRICE_CAP]
    if under_cap_nonfoil:
        under_cap_nonfoil.sort(key=lambda t: t[0])
        return under_cap_nonfoil[0][1]
    under_cap_any = [(c, p) for c, p, _ in scored if c is not None and c <= PRICE_CAP]
    if under_cap_any:
        under_cap_any.sort(key=lambda t: t[0])
        return under_cap_any[0][1]
    priced = [(c, p) for c, p, _ in scored if c is not None]
    if priced:
        priced.sort(key=lambda t: t[0])
        return priced[0][1]
    # No price data at all — just return the most recent printing.
    return max(printings, key=lambda p: p.get("released_at") or "")


def get_oracle(card: dict) -> str:
    """Get full oracle text including both faces of MDFCs / transforms / split cards."""
    if card.get("oracle_text"):
        return card["oracle_text"]
    if "card_faces" in card and card["card_faces"]:
        parts = [f.get("oracle_text", "") for f in card["card_faces"]]
        return "\n//\n".join(p for p in parts if p)
    return ""


def main() -> None:
    cardpool: list[str] = json.loads(CARDPOOL_PATH.read_text())
    banlist_raw: list[dict] = json.loads(BANLIST_PATH.read_text())
    banned = {normalize_name(b["name"]) for b in banlist_raw if b.get("name")}

    bulk = load_bulk()

    # Index every printing by normalized name. A card has many printings.
    # For DFC/MDFC/split cards, also index by each face name and the front-face name,
    # since the pool sheet may store the front face only.
    by_name: dict[str, list[dict]] = {}
    for printing in bulk:
        if printing.get("layout") in EXCLUDED_LAYOUTS:
            continue
        if printing.get("set_type") == "memorabilia":
            continue
        name = printing.get("name") or ""
        if not name:
            continue
        keys = {normalize_name(name)}
        if " // " in name:
            for part in name.split(" // "):
                keys.add(normalize_name(part))
        for face in (printing.get("card_faces") or []):
            fname = face.get("name") or ""
            if fname:
                keys.add(normalize_name(fname))
        for key in keys:
            if key:
                by_name.setdefault(key, []).append(printing)

    cards: list[dict] = []
    missing: list[str] = []
    seen_card_keys: set[str] = set()
    for name in cardpool:
        key = normalize_name(name)
        printings = by_name.get(key)
        if not printings and " // " in name:
            printings = by_name.get(normalize_name(name.split(" // ")[0]))
        if not printings:
            missing.append(name)
            continue
        # A single Scryfall printing can be matched by multiple pool names (e.g.
        # both faces of a DFC). Dedupe so we emit each card once.
        canonical = normalize_name(printings[0].get("name") or "")
        if canonical in seen_card_keys:
            continue
        seen_card_keys.add(canonical)

        chosen = pick_best_printing(printings)
        if not chosen:
            missing.append(name)
            continue

        oracle = get_oracle(chosen)
        word_count = count_words(oracle)
        prices = chosen.get("prices") or {}
        non_foil = usd(prices.get("usd"))
        any_price = min(
            (p for p in (non_foil, usd(prices.get("usd_foil")), usd(prices.get("usd_etched"))) if p is not None),
            default=None,
        )

        type_line = chosen.get("type_line") or ""
        is_banned = key in banned
        commander_eligible = (
            (
                "Legendary" in type_line
                and ("Creature" in type_line or "Vehicle" in type_line)
            )
            or CAN_BE_COMMANDER_RE.search(oracle or "") is not None
        ) and (any_price is not None and any_price <= PRICE_CAP) and not is_banned

        ninety_nine_eligible = (
            word_count <= WORD_CAP
            and any_price is not None
            and any_price <= PRICE_CAP
            and not is_banned
        )

        # Image: prefer normal-sized; fall back to card_faces[0] for MDFCs.
        image = (chosen.get("image_uris") or {}).get("normal")
        if not image and "card_faces" in chosen:
            image = (chosen["card_faces"][0].get("image_uris") or {}).get("normal")

        # P/T/loyalty live on either the top-level card or the front face.
        front = (chosen.get("card_faces") or [{}])[0] if chosen.get("card_faces") else {}
        power = chosen.get("power") or front.get("power")
        toughness = chosen.get("toughness") or front.get("toughness")
        loyalty = chosen.get("loyalty") or front.get("loyalty")

        cards.append({
            "name": chosen.get("name"),
            "oracle_text": oracle,
            "word_count": word_count,
            "type_line": type_line,
            "mana_cost": chosen.get("mana_cost") or (
                (chosen.get("card_faces") or [{}])[0].get("mana_cost") if chosen.get("card_faces") else ""
            ),
            "cmc": chosen.get("cmc"),
            "colors": chosen.get("colors") or [],
            "color_identity": chosen.get("color_identity") or [],
            "keywords": chosen.get("keywords") or [],
            "price_usd": non_foil,
            "price_min": any_price,
            "set": chosen.get("set"),
            "set_name": chosen.get("set_name"),
            "collector_number": chosen.get("collector_number"),
            "rarity": chosen.get("rarity"),
            "image": image,
            "scryfall_uri": chosen.get("scryfall_uri"),
            "edhrec_uri": chosen.get("related_uris", {}).get("edhrec"),
            "banned": is_banned,
            "ninety_nine_eligible": ninety_nine_eligible,
            "commander_eligible": commander_eligible,
            "layout": chosen.get("layout"),
            "power": power,
            "toughness": toughness,
            "loyalty": loyalty,
            "released_at": chosen.get("released_at"),
        })

    cards.sort(key=lambda c: c["name"])

    # Stats
    stats = {
        "total_pool": len(cardpool),
        "matched": len(cards),
        "missing": len(missing),
        "missing_sample": missing[:25],
        "banned": sum(1 for c in cards if c["banned"]),
        "ninety_nine_eligible": sum(1 for c in cards if c["ninety_nine_eligible"]),
        "commander_eligible": sum(1 for c in cards if c["commander_eligible"]),
        "word_count_histogram": {},
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    for c in cards:
        bucket = min(c["word_count"], 50)
        stats["word_count_histogram"][str(bucket)] = stats["word_count_histogram"].get(str(bucket), 0) + 1

    OUT_CARDS.write_text(json.dumps(cards, separators=(",", ":")))
    OUT_STATS.write_text(json.dumps(stats, indent=2))

    print(f"\n=== Enrichment complete ===")
    print(f"  pool:                {stats['total_pool']:>6}")
    print(f"  matched on Scryfall: {stats['matched']:>6}")
    print(f"  missing:             {stats['missing']:>6}")
    print(f"  banned:              {stats['banned']:>6}")
    print(f"  99-eligible:         {stats['ninety_nine_eligible']:>6}")
    print(f"  commander-eligible:  {stats['commander_eligible']:>6}")
    print(f"  wrote -> {OUT_CARDS.relative_to(ROOT)} ({OUT_CARDS.stat().st_size/1e6:.1f} MB)")
    if missing:
        print(f"\nFirst few missing names (case mismatch, alt-name, etc.):")
        for m in missing[:10]:
            print(f"  - {m}")


if __name__ == "__main__":
    main()
