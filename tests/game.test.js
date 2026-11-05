import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../site/js/game.js';

const names = (n) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
const game = (n, rules = {}, firstDealer = 0) =>
  G.createGame({ names: names(n), firstDealer, rules: { ...G.DEFAULT_RULES, ...rules }, id: 'test', now: 0 });

test('rounds per player count with the standard 60-card deck', () => {
  const expected = { 3: 20, 4: 15, 5: 12, 6: 10, 7: 8, 8: 7, 9: 6, 10: 6 };
  for (const [n, rounds] of Object.entries(expected)) {
    assert.equal(G.maxRounds(Number(n), 60), rounds, `${n} players`);
    assert.equal(G.totalRounds(game(Number(n))), rounds, `${n} players`);
  }
});

test('two decks double the rounds; custom round count is clamped', () => {
  assert.equal(G.totalRounds(game(10, { deckSize: 120 })), 12);
  assert.equal(G.totalRounds(game(8, { rounds: 5 })), 5);
  assert.equal(G.totalRounds(game(8, { rounds: 99 })), 7);
  assert.equal(game(8, { rounds: 7 }).rules.rounds, null, 'max rounds is stored as "all"');
});

test('player limits', () => {
  assert.throws(() => game(2), RangeError);
  assert.throws(() => game(11), RangeError);
  assert.equal(game(3).players.length, 3);
  assert.equal(game(10).players.length, 10);
});

test('dealer rotates clockwise and the dealer bids last', () => {
  const g = game(10, {}, 8);
  assert.equal(G.dealerIndex(g, 0), 8);
  assert.equal(G.dealerIndex(g, 1), 9);
  assert.equal(G.dealerIndex(g, 2), 0);
  assert.deepEqual(G.biddingOrder(g, 0), [9, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('no trump when every card is dealt', () => {
  const g10 = game(10);
  assert.equal(G.allCardsDealt(g10, 5), true); // 6 cards x 10 players = 60
  assert.equal(G.allCardsDealt(g10, 4), false);
  const g7 = game(7);
  assert.equal(G.allCardsDealt(g7, 7), false); // 8 x 7 = 56, 4 cards left over
});

test('standard scoring: 20 + 10 per trick, -10 per trick off', () => {
  assert.equal(G.roundScore(0, 0), 20);
  assert.equal(G.roundScore(3, 3), 50);
  assert.equal(G.roundScore(2, 0), -20);
  assert.equal(G.roundScore(0, 3), -30);
  assert.equal(G.roundScore(1, 1, { base: 10, perTrick: 5, penalty: 5 }), 15);
});

test('bids may not add up: forbidden value for the dealer', () => {
  const g = game(4, { noEvenBids: true }, 1);
  const r = 2; // round 3: 3 cards, dealer rotated from P2 to P4 (index 3)
  assert.equal(G.dealerIndex(g, r), 3);
  assert.equal(G.forbiddenBid(g, r, [1, 0, null, null]), null, 'not everyone has bid yet');
  assert.equal(G.forbiddenBid(g, r, [1, 0, 1, null]), 1);
  assert.equal(G.forbiddenBid(g, r, [2, 2, 0, null]), null, 'already over, nothing forbidden');
  assert.equal(G.validateBids(g, r, [1, 0, 1, 1]).code, 'errBidsEven');
  assert.equal(G.validateBids(g, r, [1, 0, 1, 2]).ok, true);
  assert.equal(G.validateBids(game(4), r, [1, 0, 1, 1]).ok, true, 'allowed without the rule');
});

test('correcting any bid respects "bids may not add up"', () => {
  const g = game(4, { noEvenBids: true });
  const r = 2; // 3 cards
  assert.equal(G.forbiddenBidFor(g, r, [1, 0, 1, 0], 1), 1, 'P2 (not the dealer) may not correct to 1');
  assert.equal(G.forbiddenBidFor(g, r, [1, 0, 1, 2], 3), 1);
  assert.equal(G.forbiddenBidFor(g, r, [3, 3, 1, 2], 2), null, 'others already over');
  assert.equal(G.forbiddenBidFor(game(4), r, [1, 0, 1, 2], 3), null, 'rule off');
});

test('edits of a scored round keep the optional rules that round used', () => {
  const g = game(3); // all optional rules off now
  const r = 2; // 3 cards
  const rules = G.rulesForRound(g, r, { bids: [1, 1, 1], tricks: [1, 1, 0], adjust: [0, 1, 0] });
  assert.equal(rules.cloud, true);
  assert.equal(rules.bomb, true);
  const strict = game(3, { noEvenBids: true });
  assert.equal(G.rulesForRound(strict, r, { bids: [1, 1, 1], tricks: [1, 1, 1] }).noEvenBids, false);
  assert.equal(G.rulesForRound(strict, r, { bids: [1, 1, 0], tricks: [1, 1, 1] }).noEvenBids, true);
});

test('bid validation catches gaps and out-of-range values', () => {
  const g = game(3);
  assert.equal(G.validateBids(g, 0, [0, null, 1]).code, 'errBidsMissing');
  assert.equal(G.validateBids(g, 0, [0, 2, 1]).code, 'errRange');
});

test('tricks must add up to the cards (or one less with the bomb)', () => {
  const g = game(3);
  const round = (tricks) => ({ bids: [1, 1, 0], tricks, adjust: [0, 0, 0] });
  assert.equal(G.validateTricks(g, 1, round([1, 1, 0])).ok, true);
  assert.equal(G.validateTricks(g, 1, round([1, 0, 0])).code, 'errTricksSum');
  assert.equal(G.validateTricks(g, 1, round([1, null, 0])).code, 'errTricksMissing');
  const gb = game(3, { bomb: true });
  assert.equal(G.validateTricks(gb, 1, round([1, 0, 0])).ok, true);
  assert.equal(G.validateTricks(gb, 1, round([0, 0, 0])).code, 'errTricksSumBomb');
});

test('cloud: one player may change their bid by one', () => {
  const g = game(3, { cloud: true });
  const base = { bids: [1, 1, 0], tricks: [2, 0, 0] };
  assert.equal(G.validateTricks(g, 1, { ...base, adjust: [1, 0, 0] }).ok, true);
  assert.equal(G.validateTricks(g, 1, { ...base, adjust: [1, -1, 0] }).code, 'errCloud', 'only one cloud');
  assert.equal(G.validateTricks(g, 1, { ...base, adjust: [0, 0, 1] }).code, 'errCloud', 'needs a trick');
  assert.equal(G.validateTricks(game(3), 1, { ...base, adjust: [1, 0, 0] }).code, 'errCloud', 'rule off');
  assert.deepEqual(G.cloudOptions(g, 1, { bids: [0, 2, 1] }, 0), [0, 1]);
  assert.deepEqual(G.cloudOptions(g, 1, { bids: [0, 2, 1] }, 1), [0, -1]);
  assert.deepEqual(G.cloudOptions(g, 1, { bids: [0, 2, 1] }, 2), [0, 1, -1]);
});

test('score table and ranking with ties', () => {
  const g = game(3, { cloud: true });
  g.rounds.push({ bids: [1, 0, 0], tricks: [1, 0, 0], adjust: [0, 0, 0] }); // +30 +20 +20
  g.rounds.push({ bids: [0, 2, 1], tricks: [0, 1, 1], adjust: [0, -1, 0] }); // +20 +30 +30
  const { deltas, totals, final, hits } = G.scoreTable(g);
  assert.deepEqual(deltas, [
    [30, 20, 20],
    [20, 30, 30],
  ]);
  assert.deepEqual(totals[1], [50, 50, 50]);
  assert.deepEqual(final, [50, 50, 50]);
  assert.deepEqual(hits, [2, 2, 2]);
  assert.deepEqual(
    G.ranking([40, 70, 40, 10]).map((r) => [r.player, r.rank]),
    [
      [1, 1],
      [0, 2],
      [2, 2],
      [3, 4],
    ]
  );
});

test('a full 10-player game: commit, finish and undo', () => {
  const g = game(10);
  const total = G.totalRounds(g);
  for (let r = 0; r < total; r++) {
    const cards = G.cardsInRound(r);
    g.live = G.newLiveRound(10);
    g.live.bids = Array(10).fill(0);
    g.live.tricks = Array(10).fill(0);
    g.live.tricks[r % 10] = cards; // one player takes every trick
    assert.equal(G.commitLiveRound(g, 1).ok, true);
  }
  assert.equal(g.rounds.length, 6);
  assert.equal(G.isFinished(g), true);
  assert.equal(g.finishedAt, 1);
  const { final } = G.scoreTable(g);
  // Players 0-5 each missed one round by `cards` tricks; players 6-9 hit every round.
  assert.deepEqual(final, [90, 80, 70, 60, 50, 40, 120, 120, 120, 120]);

  assert.equal(G.undoLastRound(g), true);
  assert.equal(g.rounds.length, 5);
  assert.equal(g.live.phase, 'play');
  assert.equal(g.finishedAt, null);
});

test('invalid live rounds are not committed', () => {
  const g = game(3);
  g.live = G.newLiveRound(3);
  g.live.bids = [0, 0, 1];
  g.live.tricks = [0, 0, 0];
  assert.equal(G.commitLiveRound(g).code, 'errTricksSum');
  assert.equal(g.rounds.length, 0);
});

test('rules are normalized', () => {
  const r = G.normalizeRules({ deckSize: 'abc', rounds: '3', scoring: { base: -5, perTrick: 12.4 } }, 5);
  assert.equal(r.deckSize, 60);
  assert.equal(r.rounds, 3);
  assert.deepEqual(r.scoring, { base: 0, perTrick: 12, penalty: 10 });
  assert.equal(G.normalizeRules({ deckSize: 4 }, 10).deckSize, 10, 'deck holds at least one card per player');
});
