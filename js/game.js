// Pure game logic for Wizard scoring. No DOM access, so it can be unit tested in Node.

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 10;
export const STANDARD_DECK = 60;

export const DEFAULT_SCORING = Object.freeze({ base: 20, perTrick: 10, penalty: 10 });

export const DEFAULT_RULES = Object.freeze({
  deckSize: STANDARD_DECK,
  rounds: null, // null = play every round the deck allows
  noEvenBids: false, // sum of bids may not equal the number of cards
  bomb: false, // one trick per round may be won by nobody
  cloud: false, // winner of the cloud trick changes their bid by ±1
  scoring: DEFAULT_SCORING,
});

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
};

const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);

/** Most rounds a deck allows: every player gets `round` cards in round `round`. */
export function maxRounds(playerCount, deckSize = STANDARD_DECK) {
  if (!playerCount || playerCount < 1) return 0;
  return Math.max(0, Math.floor(deckSize / playerCount));
}

export function normalizeRules(rules = {}, playerCount = MIN_PLAYERS) {
  const deckSize = clampInt(rules.deckSize, Math.max(1, playerCount), 999, STANDARD_DECK);
  const max = maxRounds(playerCount, deckSize);
  const rounds = rules.rounds == null || rules.rounds === '' ? null : clampInt(rules.rounds, 1, max, null);
  const s = rules.scoring || {};
  return {
    deckSize,
    rounds: rounds === max ? null : rounds,
    noEvenBids: !!rules.noEvenBids,
    bomb: !!rules.bomb,
    cloud: !!rules.cloud,
    scoring: {
      base: clampInt(s.base, 0, 999, DEFAULT_SCORING.base),
      perTrick: clampInt(s.perTrick, 0, 999, DEFAULT_SCORING.perTrick),
      penalty: clampInt(s.penalty, 0, 999, DEFAULT_SCORING.penalty),
    },
  };
}

export function makeId(now = Date.now()) {
  return now.toString(36) + Math.random().toString(36).slice(2, 7);
}

export function createGame({ names, firstDealer = 0, rules = DEFAULT_RULES, id, now = Date.now() }) {
  if (!Array.isArray(names) || names.length < MIN_PLAYERS || names.length > MAX_PLAYERS) {
    throw new RangeError(`A game needs ${MIN_PLAYERS}–${MAX_PLAYERS} players`);
  }
  const n = names.length;
  return {
    v: 1,
    id: id ?? makeId(now),
    createdAt: now,
    updatedAt: now,
    finishedAt: null,
    players: names.map((name, i) => ({ id: i, name: String(name) })),
    firstDealer: ((Math.round(firstDealer) % n) + n) % n,
    rules: normalizeRules(rules, n),
    rounds: [],
    live: null,
  };
}

export function totalRounds(game) {
  const max = maxRounds(game.players.length, game.rules.deckSize);
  const r = game.rules.rounds;
  return r ? Math.min(Math.max(1, r), max) : max;
}

/** Round index is 0-based; round 1 deals 1 card, round 2 deals 2 cards, ... */
export const cardsInRound = (roundIndex) => roundIndex + 1;

export function dealerIndex(game, roundIndex) {
  const n = game.players.length;
  return (game.firstDealer + roundIndex) % n;
}

/** Players in bidding order: starts left of the dealer, the dealer bids last. */
export function biddingOrder(game, roundIndex) {
  const n = game.players.length;
  const d = dealerIndex(game, roundIndex);
  return Array.from({ length: n }, (_, i) => (d + 1 + i) % n);
}

/** True when every card is dealt, so there is no card left to turn up for trump. */
export function allCardsDealt(game, roundIndex) {
  return cardsInRound(roundIndex) * game.players.length >= game.rules.deckSize;
}

export function roundScore(bid, tricks, scoring = DEFAULT_SCORING) {
  if (bid === tricks) return scoring.base + scoring.perTrick * tricks;
  return -scoring.penalty * Math.abs(bid - tricks);
}

export function effectiveBid(round, p) {
  return round.bids[p] + ((round.adjust && round.adjust[p]) || 0);
}

export function newLiveRound(playerCount) {
  return {
    phase: 'bid',
    bids: Array(playerCount).fill(null),
    tricks: Array(playerCount).fill(null),
    adjust: Array(playerCount).fill(0),
  };
}

/**
 * With the "bids may not add up" rule the dealer (last bidder) may not bid the value
 * that makes the total equal the cards. Returns that value once all others have bid.
 */
export function forbiddenBid(game, roundIndex, bids) {
  return forbiddenBidFor(game, roundIndex, bids, dealerIndex(game, roundIndex));
}

/** Same check for any player, used when a bid is corrected after everyone has bid. */
export function forbiddenBidFor(game, roundIndex, bids, player) {
  if (!game.rules.noEvenBids) return null;
  const cards = cardsInRound(roundIndex);
  let others = 0;
  for (let p = 0; p < game.players.length; p++) {
    if (p === player) continue;
    if (bids[p] == null) return null;
    others += bids[p];
  }
  const f = cards - others;
  return f >= 0 && f <= cards ? f : null;
}

/**
 * Rules to check an edit of a scored round against. Optional rules can be switched
 * during a game, so a rule the round already relied on stays allowed for that round.
 */
export function rulesForRound(game, roundIndex, round) {
  const cards = cardsInRound(roundIndex);
  const rules = { ...game.rules };
  if (round.adjust && round.adjust.some((a) => a)) rules.cloud = true;
  if (sum(round.tricks) === cards - 1) rules.bomb = true;
  if (sum(round.bids) === cards) rules.noEvenBids = false;
  return rules;
}

const OK = Object.freeze({ ok: true });
const fail = (code, params = {}) => ({ ok: false, code, params });

export function validateBids(game, roundIndex, bids) {
  const cards = cardsInRound(roundIndex);
  if (!bids || bids.length !== game.players.length || bids.some((b) => b == null)) {
    return fail('errBidsMissing');
  }
  if (bids.some((b) => !Number.isInteger(b) || b < 0 || b > cards)) return fail('errRange', { cards });
  if (game.rules.noEvenBids && sum(bids) === cards) {
    const dealer = dealerIndex(game, roundIndex);
    return fail('errBidsEven', { cards, name: game.players[dealer].name });
  }
  return OK;
}

export function allowedTrickTotals(game, roundIndex) {
  const cards = cardsInRound(roundIndex);
  return game.rules.bomb ? [cards, cards - 1] : [cards];
}

export function validateTricks(game, roundIndex, round) {
  const n = game.players.length;
  const cards = cardsInRound(roundIndex);
  const { tricks } = round;
  if (!tricks || tricks.length !== n || tricks.some((x) => x == null)) return fail('errTricksMissing');
  if (tricks.some((x) => !Number.isInteger(x) || x < 0 || x > cards)) return fail('errRange', { cards });
  if (!allowedTrickTotals(game, roundIndex).includes(sum(tricks))) {
    return fail(game.rules.bomb ? 'errTricksSumBomb' : 'errTricksSum', { cards, less: cards - 1 });
  }
  const adjust = round.adjust || Array(n).fill(0);
  const changed = [];
  for (let p = 0; p < n; p++) {
    const a = adjust[p] || 0;
    if (a === 0) continue;
    if (!game.rules.cloud || (a !== 1 && a !== -1)) return fail('errCloud');
    const eb = round.bids[p] + a;
    if (eb < 0 || eb > cards || tricks[p] < 1) return fail('errCloud');
    changed.push(p);
  }
  if (changed.length > 1) return fail('errCloud');
  return OK;
}

export function validateRound(game, roundIndex, round) {
  const b = validateBids(game, roundIndex, round.bids);
  return b.ok ? validateTricks(game, roundIndex, round) : b;
}

/** Cloud adjustments the given player could make this round, in toggle order. */
export function cloudOptions(game, roundIndex, round, p) {
  if (!game.rules.cloud || round.bids[p] == null) return [0];
  const cards = cardsInRound(roundIndex);
  const opts = [0];
  if (round.bids[p] + 1 <= cards) opts.push(1);
  if (round.bids[p] - 1 >= 0) opts.push(-1);
  return opts;
}

export function scoreTable(game) {
  const n = game.players.length;
  const run = Array(n).fill(0);
  const hits = Array(n).fill(0);
  const deltas = [];
  const totals = [];
  for (const round of game.rounds) {
    const d = [];
    for (let p = 0; p < n; p++) {
      const eb = effectiveBid(round, p);
      const pts = roundScore(eb, round.tricks[p], game.rules.scoring);
      if (eb === round.tricks[p]) hits[p]++;
      run[p] += pts;
      d.push(pts);
    }
    deltas.push(d);
    totals.push(run.slice());
  }
  return { deltas, totals, final: run.slice(), hits };
}

/** Sort players by score; equal scores share a rank (1, 1, 3). */
export function ranking(scores) {
  const rows = scores
    .map((score, player) => ({ player, score, rank: 0 }))
    .sort((a, b) => b.score - a.score || a.player - b.player);
  let prev = null;
  rows.forEach((row, i) => {
    if (row.score !== prev) {
      row.rank = i + 1;
      prev = row.score;
    } else {
      row.rank = rows[i - 1].rank;
    }
  });
  return rows;
}

export function isFinished(game) {
  return game.rounds.length >= totalRounds(game);
}

/** Move the live round into the scored rounds. Returns the scored round. */
export function commitLiveRound(game, now = Date.now()) {
  const r = game.rounds.length;
  const live = game.live;
  if (!live) throw new Error('No round in progress');
  const check = validateRound(game, r, live);
  if (!check.ok) return check;
  game.rounds.push({ bids: live.bids.slice(), tricks: live.tricks.slice(), adjust: live.adjust.slice() });
  game.live = null;
  game.updatedAt = now;
  if (isFinished(game)) game.finishedAt = now;
  return OK;
}

/** Re-open the last scored round so it can be corrected. */
export function undoLastRound(game, now = Date.now()) {
  const last = game.rounds.pop();
  if (!last) return false;
  const adjust = last.adjust ? last.adjust.slice() : Array(game.players.length).fill(0);
  game.live = { phase: 'play', bids: last.bids.slice(), tricks: last.tricks.slice(), adjust };
  game.finishedAt = null;
  game.updatedAt = now;
  return true;
}
