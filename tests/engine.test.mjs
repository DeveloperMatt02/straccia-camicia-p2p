// Test del motore: node tests/engine.test.mjs
import assert from 'node:assert/strict';
import {
  createGame, play, slap, makeRng, totalCards, buildDeck, payValue,
} from '../js/engine.js';

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok  -', name); }
  catch (e) { console.error('FAIL-', name); throw e; }
}

const P = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'G' + i }));
const C = (r, s = 'C', d = 0) => ({ id: `${s}${r}.${d}.${Math.random()}`, s, r });
function setHands(st, hands, turn = 0) {
  st.players.forEach((p, i) => { p.hand = hands[i].map(r => C(r)); p.out = false; });
  st.pile = []; st.under = []; st.turn = turn; st.obligation = null;
}

test('mazzi da 40/80/120 carte', () => {
  assert.equal(buildDeck(1).length, 40);
  assert.equal(buildDeck(2).length, 80);
  assert.equal(buildDeck(3).length, 120);
  assert.equal(new Set(buildDeck(3).map(c => c.id)).size, 120);
});

test('solo asso, 2 e 3 sono vincenti', () => {
  assert.deepEqual([1, 2, 3, 4, 7, 8, 10].map(r => payValue({ r })), [1, 2, 3, 0, 0, 0, 0]);
});

test('distribuzione: avanzi ai primi dopo il mazziere', () => {
  const st = createGame({ players: P(3), dealer: 0, rng: makeRng(1) });
  assert.deepEqual(st.players.map(p => p.hand.length), [13, 14, 13]);
  assert.equal(st.turn, 1);
  const st6 = createGame({ players: P(6), dealer: 5, rng: makeRng(2) });
  assert.deepEqual(st6.players.map(p => p.hand.length), [7, 7, 7, 7, 6, 6]);
  assert.equal(st6.turn, 0);
});

test('turno sbagliato rifiutato', () => {
  const st = createGame({ players: P(2), rng: makeRng(3) });
  assert.equal(play(st, 0).ok, false);
  assert.equal(play(st, 1).ok, true);
});

test('un tre obbliga a pagare 3; se non esce una vincente, il creditore prende', () => {
  const st = createGame({ players: P(2), rng: makeRng(4) });
  setHands(st, [[3, 5], [4, 5, 6, 7]]);
  play(st, 0);
  assert.equal(st.turn, 1);
  assert.equal(st.obligation.remaining, 3);
  play(st, 1); play(st, 1);
  assert.equal(st.turn, 1, 'chi paga continua a giocare');
  const r = play(st, 1);
  assert.ok(r.events.some(e => e.type === 'collect' && e.p === 0 && e.n === 4));
  assert.equal(st.players[0].hand.length, 5);
  assert.equal(st.turn, 0, 'chi prende riparte');
  assert.equal(st.round, 2);
});

test('una vincente durante il pagamento passa l\'obbligo', () => {
  const st = createGame({ players: P(3), rng: makeRng(5) });
  setHands(st, [[2, 9], [5, 1, 9], [6, 7]]);
  play(st, 0);           // 2 → G1 deve 2
  play(st, 1);           // 5
  play(st, 1);           // asso → G2 deve 1, creditore G1
  assert.equal(st.turn, 2);
  assert.deepEqual([st.obligation.owner, st.obligation.remaining], [1, 1]);
  play(st, 2);           // 6 → G1 prende 4 carte
  assert.equal(st.players[1].hand.length, 1 + 4);
  assert.equal(st.turn, 1);
});

test('il primo mazzetto collezionato mette le carte sotto, prima giocata in cima', () => {
  const st = createGame({ players: P(2), rng: makeRng(6) });
  setHands(st, [[1, 9], [5, 6]]);
  play(st, 0); play(st, 1);
  assert.deepEqual(st.players[0].hand.map(c => c.r), [9, 1, 5]);
});

test('finire le carte mentre si paga: il creditore prende', () => {
  const st = createGame({ players: P(3), rng: makeRng(7) });
  setHands(st, [[3, 4], [5], [6]]);
  play(st, 0);           // G1 deve 3 ma ha 1 carta
  const r = play(st, 1);
  assert.ok(r.events.some(e => e.type === 'broke'));
  assert.equal(st.turn, 0);
  assert.equal(st.players[0].hand.length, 1 + 2);
});

test('chi tocca senza carte è fuori; ultimo rimasto vince', () => {
  const st = createGame({ players: P(2), rng: makeRng(8) });
  setHands(st, [[5], [6, 7]]);
  play(st, 0); play(st, 1);
  assert.equal(st.phase, 'over');
  assert.equal(st.winner, 1);
  assert.equal(st.players[1].hand.length, 3);
});

test('vincente come ultima carta: si può ancora riprendere il mazzetto', () => {
  const st = createGame({ players: P(2), rng: makeRng(9) });
  setHands(st, [[1], [6, 7]]);
  play(st, 0); play(st, 1);
  assert.equal(st.phase, 'playing');
  assert.equal(st.players[0].hand.length, 2);
});

test('schiaffo giusto prende, sbagliato paga sotto il mazzetto', () => {
  const st = createGame({ players: P(3), rules: { slap: true }, rng: makeRng(10) });
  setHands(st, [[5, 8], [5, 9], [7, 7]]);
  play(st, 0);
  const wrong = slap(st, 2, { round: st.round, len: st.pile.length });
  assert.equal(wrong.kind, 'wrong');
  assert.equal(st.under.length, 1);
  assert.equal(st.players[2].hand.length, 1);
  play(st, 1);           // 5 su 5: doppia!
  const ok = slap(st, 2, { round: st.round, len: st.pile.length });
  assert.equal(ok.kind, 'win');
  assert.equal(st.players[2].hand.length, 1 + 3);
  assert.equal(st.turn, 2);
  const stale = slap(st, 0, { round: st.round - 1, len: 2 });
  assert.equal(stale.kind, 'stale');
});

test('schiaffo valido anche se nel frattempo è stata giocata un\'altra carta', () => {
  const st = createGame({ players: P(2), rules: { slap: true }, rng: makeRng(11) });
  setHands(st, [[5, 8], [5, 9]]);
  play(st, 0); play(st, 1);
  const len = st.pile.length;
  play(st, 0);           // un'altra carta sopra
  assert.equal(slap(st, 1, { round: st.round, len }).kind, 'win');
});

test('le carte si conservano in 2000 partite casuali (2-6 giocatori, 1-3 mazzi, schiaffi)', () => {
  const rng = makeRng(42);
  let infinite = 0, finished = 0;
  for (let g = 0; g < 2000; g++) {
    const n = 2 + (g % 5), decks = 1 + (g % 3), slapOn = g % 2 === 0;
    const st = createGame({ players: P(n), rules: { decks, slap: slapOn }, dealer: g % n, rng });
    const total = totalCards(st);
    let steps = 0;
    while (st.phase === 'playing' && steps < 200000) {
      if (slapOn && rng() < 0.05) {
        const who = Math.floor(rng() * n);
        if (!st.players[who].out) slap(st, who, { round: st.round, len: st.pile.length });
      } else {
        assert.equal(play(st, st.turn).ok, true);
      }
      assert.equal(totalCards(st), total);
      steps++;
    }
    if (st.draw) infinite++;
    else {
      assert.equal(st.phase, 'over');
      assert.equal(st.players[st.winner].hand.length, total);
      finished++;
    }
  }
  console.log(`      ${finished} finite, ${infinite} infinite`);
});

test('la partita infinita trovata nel 2017 viene riconosciuta', () => {
  // Da Wikipedia: 0 = carta non vincente.
  const g1 = '0 0 3 0 2 0 2 0 3 0 3 1 0 0 0 0 0 3 1 0'.split(' ').map(Number);
  const g2 = '0 0 1 0 0 2 0 0 0 0 2 0 0 0 0 0 0 0 1 0'.split(' ').map(Number);
  const st = createGame({ players: P(2), rng: makeRng(12) });
  const fill = [4, 5, 6, 7, 8, 9, 10];
  let k = 0;
  setHands(st, [g1.map(r => r || fill[k++ % 7]), g2.map(r => r || fill[k++ % 7])], 0);
  let steps = 0;
  while (st.phase === 'playing' && steps < 100000) { play(st, st.turn); steps++; }
  assert.equal(st.draw, true);
  console.log(`      riconosciuta dopo ${st.plays} carte giocate`);
});

console.log(`\n${passed} test superati`);
