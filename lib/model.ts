// Token Radar: the model behind the board.
//
// One snapshot of the protocol universe goes in, one ranked board comes out. The board's floor is
// the snapshot's watchlist, and it adds every other protocol the watchlist's own rule would keep:
// below the floor, and the above-floor ones the list leaves out only because DefiLlama records a
// parent protocol for them. A protocol is pre-token when its record carries no token at all (no
// market cap, no CoinGecko id, no symbol). Wrapped, staked and bridged products of a token that
// already trades are not launches of their own, so the board leaves them out exactly as the
// watchlist does: a category of Bridge, Canonical Bridge, Liquid Staking, Liquid Restaking,
// Restaked BTC or CEX, a name carrying a whole word wrapped, staked or staking, a name beginning
// with an exchange's name, or a name ending in a version marker. The snapshot's live-token
// protocols are kept apart and shown as the market's own values, never mixed into the ranking.
//
// Implied value (model radar-2) follows only from the snapshot's own figures:
//
//   base       = tvl_usd x 0.25
//   growth     = clamp(change_7d, -50, 100) per cent
//   growthMult = 1 + (growth / 100) x 0.5
//   maturity   = 0.5 + 0.5 x sqrt(min(age_days, 1095) / 1095)   (age_days unknown: 365)
//   implied    = max(1, round(base x growthMult x maturity))
//
// Why these shapes. A launch typically prices at a fraction of the value already locked in the
// protocol, so the base is TVL times a conservative quarter. Growth is clamped hard at both ends
// because a seven-day spike is usually one event, not a trend: the snapshot's largest jump is
// +4,448%, and no launch is worth forty-five times another on one week's print. Maturity rewards
// survival with diminishing returns: a protocol that has run a year with no token has proven
// itself and faces real pressure to launch, while the fourth year adds less than the first, so the
// curve is a square root, not a straight line. No protocol name is ever special-cased: the same
// function scores every row.
//
// Confidence is a second, separate signal, and it never moves a rank. It answers a different
// question from implied value: how much of the snapshot actually supports this row. Four parts,
// each from the protocol's own record, add to a score out of 100:
//
//   size         0..40  log TVL from the $5M snapshot floor to $5B: a bigger lock is more signal
//   history      0..25  days listed, capped at three years; an unknown age scores a neutral 10
//   stability    0..20  a calm seven-day print scores high, a wild one scores low; unknown is 10
//   completeness 0..15  five points each for a known age, a known seven-day change, a named chain
//
// A score of 70 or more is high, 40 to 69 is medium, below 40 is low. The dashboard shows the
// score, its band and its four parts on every row, so a reader can see at a glance which implied
// values rest on a thick record and which rest on a thin one.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.5,
  maturity_range: 0.5,
  maturity_days: 1095,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** The four parts of a confidence score, each from the protocol's own record. */
export interface ConfidenceParts {
  size: number;
  history: number;
  stability: number;
  completeness: number;
}

/** A confidence band: high at 70 and above, medium from 40, low below 40. */
export type ConfidenceBand = 'high' | 'medium' | 'low';

/** How much of the snapshot supports a row: a score out of 100, its band, and its parts. */
export interface Confidence {
  score: number;
  band: ConfidenceBand;
  parts: ConfidenceParts;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
  };
  confidence: number;
  confidence_band: ConfidenceBand;
  confidence_parts: ConfidenceParts;
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  confidence: number;
  confidence_band: ConfidenceBand;
  confidence_parts: ConfidenceParts;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** How the board's confidence scores fall across its rows, for the dashboard's summary. */
export interface ConfidenceSummary {
  high: number;
  medium: number;
  low: number;
  mean: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  confidence: ConfidenceSummary;
  rows: RadarRow[];
  live: LiveRow[];
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

// ---------------------------------------------------------------- small numbers

const DAY_MS = 86_400_000;
const LOG_TVL_FLOOR = Math.log10(5_000_000);
const LOG_TVL_CEILING = Math.log10(5_000_000_000);

/** A number clamped into 0..1. */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A number rounded to four decimals, for the board's model block. */
function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

// ---------------------------------------------------------------- age and value

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The three multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor +
    model.maturity_range * Math.sqrt(Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult));
  return { implied, growthPct, growthMult, maturityMult, age };
}

// ---------------------------------------------------------------- confidence

/** The band a score falls in: high at 70 and above, medium from 40, low below 40. */
export function confidenceBand(score: number): ConfidenceBand {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * How much of the snapshot supports one protocol: a score out of 100 and its band, with the four
 * parts the dashboard shows. Size is log TVL from the snapshot's $5M floor to $5B; history is days
 * listed capped at three years; stability falls as the seven-day print grows wild; completeness
 * counts what the record actually carries. A missing age or a missing seven-day change scores a
 * neutral 10 on its part rather than zero, because an absent print is not a bad one.
 */
export function confidenceFor(p: SnapshotProtocol, age: number | null): Confidence {
  const size = Math.round(40 * clamp01((Math.log10(Math.max(1, p.tvl_usd)) - LOG_TVL_FLOOR) / (LOG_TVL_CEILING - LOG_TVL_FLOOR)));
  const history = age === null ? 10 : Math.round((25 * Math.min(age, 1095)) / 1095);
  const growth = p.change_7d;
  const stability = growth === null ? 10 : Math.round(Math.max(0, 20 - Math.min(20, Math.abs(growth) / 5)));
  const completeness = (age !== null ? 5 : 0) + (growth !== null ? 5 : 0) + (p.chains.length > 0 ? 5 : 0);
  const score = size + history + stability + completeness;
  return { score, band: confidenceBand(score), parts: { size, history, stability, completeness } };
}

// ---------------------------------------------------------------- selection

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The watchlist's own exclusion categories: wrapped, staked and bridged products, and exchanges. */
const EXCLUDED_CATEGORY = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchanges whose name at the start of a protocol's name marks an exchange product, not a launch. */
const EXCHANGE_PREFIX = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is a launch of its own rather than a wrapped, staked or bridged product of a
 * token that already trades: the watchlist's rule, applied to every row the board ranks. The
 * watchlist itself is the floor and is always kept; this decides only the rows beyond it.
 */
export function isOwnLaunch(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORY.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (/\b(wrapped|staked|staking)\b/i.test(p.name)) return false;
  for (const e of EXCHANGE_PREFIX) if (p.name.startsWith(e)) return false;
  return true;
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other protocol the watchlist's own rule would keep, above or below the
  // floor. Never a replacement for a watchlist row: a chosen protocol stays chosen.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isOwnLaunch(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const value = impliedValue(p, snapshot.as_of, model);
    const confidence = confidenceFor(p, value.age);
    return { p, value, confidence };
  });
  scored.sort((a, b) => b.value.implied - a.value.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.value.age,
    implied_value_usd: s.value.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.value.growthPct,
      growth_multiplier: round4(s.value.growthMult),
      maturity_multiplier: round4(s.value.maturityMult),
      age_days: s.value.age,
    },
    confidence: s.confidence.score,
    confidence_band: s.confidence.band,
    confidence_parts: s.confidence.parts,
    farm_steps: farmSteps(s.p, s.value.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    confidence: row.confidence,
    confidence_band: row.confidence_band,
    confidence_parts: row.confidence_parts,
    watchlist,
  };
}

/** How the board's confidence scores fall: counts per band and the mean score. */
export function confidenceSummary(rows: BoardRow[]): ConfidenceSummary {
  let high = 0;
  let medium = 0;
  let low = 0;
  let total = 0;
  for (const r of rows) {
    total += r.confidence;
    if (r.confidence_band === 'high') high++;
    else if (r.confidence_band === 'medium') medium++;
    else low++;
  }
  return { high, medium, low, mean: rows.length === 0 ? 0 : Math.round(total / rows.length) };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    confidence: confidenceSummary(board),
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

// ---------------------------------------------------------------- the farm plan

/** What one transaction costs on a chain, in the words a farmer budgets by. */
export function gasFor(chain: string): string {
  const tiers: Array<{ chains: string[]; label: string }> = [
    { chains: ['ethereum'], label: 'about $8 to $15 of gas per transaction' },
    { chains: ['bitcoin', 'tron', 'binance'], label: 'about $1 to $3 of gas per transaction' },
    {
      chains: ['solana', 'sui', 'aptos', 'stellar', 'hyperliquid l1', 'monad', 'movement', 'sei'],
      label: 'a few cents of gas per transaction',
    },
  ];
  const c = chain.toLowerCase();
  for (const tier of tiers) if (tier.chains.includes(c)) return tier.label;
  return 'under $0.50 of gas per transaction';
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  const tiers: Array<[number, number]> = [
    [5_000_000_000, 250],
    [1_000_000_000, 150],
    [100_000_000, 100],
    [25_000_000, 75],
  ];
  for (const [floor, capital] of tiers) if (p.tvl_usd >= floor) return capital;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/**
 * The category's one action, in the words a farmer can follow. The rules are a table, first match
 * wins, each rule naming the category words it answers to and the sentence it writes; nothing here
 * names a protocol, so the same table serves every row.
 */
const ACTION_RULES: Array<{ keys: string[]; write: (name: string, capital: number, chain: string) => string }> = [
  {
    keys: ['risk curator', 'curator', 'allocator'],
    write: (name, capital, chain) => `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares.`,
  },
  {
    keys: ['rwa'],
    write: (name, capital, chain) => `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.`,
  },
  {
    keys: ['basis trad'],
    write: (name, capital, chain) => `Deposit $${capital} of USDC into ${name}'s basis-trading strategy on ${chain}.`,
  },
  {
    keys: ['uncollateralized'],
    write: (name, capital, chain) => `Lend $${capital} of USDC through ${name} on ${chain} and keep the loan open.`,
  },
  {
    keys: ['lend', 'cdp', 'collateral'],
    write: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`,
  },
  {
    keys: ['liquidity manager'],
    write: (name, capital, chain) => `Deposit $${capital} into a ${name} managed liquidity position on ${chain}.`,
  },
  {
    keys: ['leveraged farm', 'yield aggregator', 'yield', 'farm'],
    write: (name, capital, chain) => `Deposit $${capital} of USDC into ${name}'s main yield position on ${chain} and keep it open.`,
  },
  {
    keys: ['dex'],
    write: (name, capital, chain) => `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`,
  },
  {
    keys: ['restak'],
    write: (name, capital, chain) => `Restake $${capital} of the chain's staking asset through ${name} and keep the receipt.`,
  },
  {
    keys: ['staking'],
    write: (name, capital, chain) => `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`,
  },
  {
    keys: ['perpetual', 'derivative', 'interest rate'],
    write: (name, capital, chain) => `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`,
  },
  {
    keys: ['prediction'],
    write: (name, capital, chain) => `Fund $${capital} and place one market position on ${name}.`,
  },
  {
    keys: ['insurance'],
    write: (name, capital, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`,
  },
  {
    keys: ['payment', 'card'],
    write: (name, capital, chain) => `Spend $${capital} through ${name} on ${chain} and keep the receipts.`,
  },
  {
    keys: ['cedefi'],
    write: (name, capital, chain) => `Deposit $${capital} of USDC into ${name}'s CeDeFi vault on ${chain}.`,
  },
  {
    keys: ['index'],
    write: (name, capital, chain) => `Buy $${capital} of the ${name} index on ${chain} and hold it.`,
  },
  {
    keys: ['otc'],
    write: (name, capital, chain) => `Place one $${capital} order through ${name} on ${chain}.`,
  },
  {
    keys: ['governance'],
    write: (name, capital, chain) => `Deposit $${capital} and vote once on ${name}'s governance.`,
  },
  {
    keys: ['stable'],
    write: (name, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`,
  },
  {
    keys: ['bridge', 'cross chain'],
    write: (name, capital, chain) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`,
  },
  {
    keys: ['btc', 'anchor'],
    write: (name, capital, chain) => `Deposit $${capital} of BTC through ${name} on ${chain} and keep the receipt.`,
  },
  {
    keys: ['chain'],
    write: (name, capital, chain) => `Bridge $${capital} to ${name}'s chain and make one transaction a week in its app.`,
  },
];

/** The category's one action, from the table; a category no rule answers gets the plain deposit. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  for (const rule of ACTION_RULES) {
    if (rule.keys.some((k) => c.includes(k))) return rule.write(p.name, capital, chain);
  }
  return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Gas is priced by the chain the protocol runs on: Ethereum costs dollars a transaction,
 * a layer 2 costs cents, and Solana-class chains cost almost nothing.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  const lc = chain.toLowerCase();
  const weekly =
    lc === 'ethereum'
      ? 'about $8 of gas a week'
      : lc === 'bitcoin' || lc === 'tron' || lc === 'binance'
        ? 'about $2 of gas a week'
        : 'under $0.50 of gas a week';
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: gas,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: weekly,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

// ---------------------------------------------------------------- reading the snapshot

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

// ---------------------------------------------------------------- the gate's own checks

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
