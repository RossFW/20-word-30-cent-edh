export type Card = {
  name: string;
  oracle_text: string;
  word_count: number;
  type_line: string;
  mana_cost: string;
  cmc: number;
  colors: string[];           // e.g. ["G"]
  color_identity: string[];   // e.g. ["G","U"]
  keywords: string[];
  price_usd: number | null;
  price_min: number | null;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  image: string | null;
  scryfall_uri: string;
  edhrec_uri?: string;
  banned: boolean;
  ninety_nine_eligible: boolean;
  commander_eligible: boolean;
  layout: string;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  released_at: string | null;
};

export type DeckSlot = { name: string; count: number };
export type Deck = {
  commander: string | null;
  ninety_nine: DeckSlot[];
};
