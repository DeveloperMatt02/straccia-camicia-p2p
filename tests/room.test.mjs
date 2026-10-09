// Test della stanza con orologio finto: node tests/room.test.mjs
import assert from 'node:assert/strict';
import { Room } from '../js/room.js';
import { totalCards } from '../js/engine.js';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok  -', name); }
  catch (e) { console.error('FAIL-', name); throw e; }
}

function fakeClock() {
  let now = 0, id = 0;
  const q = new Map();
  return {
    now: () => now,
    timers: {
      setTimeout: (fn, ms) => { q.set(++id, { at: now + ms, fn }); return id; },
      clearTimeout: k => q.delete(k),
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [k, v] of q) if (v.at <= end && (!next || v.at < next[1].at)) next = [k, v];
        if (!next) break;
        q.delete(next[0]); now = next[1].at; next[1].fn();
        await Promise.resolve();
      }
      now = end;
      await Promise.resolve();
    },
  };
}

function setup(n = 3, seed = 1) {
  const clock = fakeClock();
  const inbox = {};
  const room = new Room({
    hostCid: 'c0', seed, timers: clock.timers, now: clock.now,
    send: (cid, m) => (inbox[cid] ||= []).push(m),
    broadcast: m => { for (const c of room.order) (inbox[c] ||= []).push(m); },
  });
  for (let i = 0; i < n; i++) room.handle('c' + i, { t: 'hello', name: 'G' + i });
  return { room, clock, inbox };
}
const last = (inbox, cid, t) => [...(inbox[cid] || [])].reverse().find(m => m.t === t);

await test('ingresso, nomi doppi e stanza piena', async () => {
  const { room, inbox } = setup(0);
  room.handle('a', { t: 'hello', name: 'Luca' });
  room.handle('b', { t: 'hello', name: 'luca' });
  assert.deepEqual(room.lobbyView().members.map(m => m.name), ['Luca', 'luca 2']);
  for (let i = 0; i < 4; i++) room.handle('x' + i, { t: 'hello', name: 'X' });
  room.handle('y', { t: 'hello', name: 'Y' });
  assert.equal(last(inbox, 'y', 'error').code, 'full');
});

await test('solo l\'host cambia le impostazioni e avvia', async () => {
  const { room } = setup(2);
  room.handle('c1', { t: 'settings', settings: { decks: 3 } });
  assert.equal(room.settings.decks, 1);
  room.handle('c0', { t: 'settings', settings: { decks: 2, timer: 2.5, slap: false } });
  assert.deepEqual([room.settings.decks, room.settings.timer, room.settings.slap], [2, 2.5, false]);
  room.handle('c1', { t: 'start' });
  assert.equal(room.game, null);
  room.handle('c0', { t: 'start' });
  assert.equal(totalCards(room.game), 80);
});

await test('lo stato inviato non rivela le carte coperte', async () => {
  const { room, clock, inbox } = setup(2);
  room.handle('c0', { t: 'start' });
  await clock.advance(1);
  const s = last(inbox, 'c1', 'state');
  assert.ok(s.view.players.every(p => p.hand === undefined && typeof p.count === 'number'));
});

await test('niente giocate durante la distribuzione, poi si gioca a turno', async () => {
  const { room, clock } = setup(2);
  room.handle('c0', { t: 'start' });
  const turnCid = room.seats[room.game.turn];
  room.handle(turnCid, { t: 'play' });
  assert.equal(room.game.plays, 0);
  await clock.advance(2000);
  room.handle(turnCid, { t: 'play' });
  assert.equal(room.game.plays, 1);
});

await test('chi è disconnesso gioca in automatico', async () => {
  const { room, clock } = setup(2);
  room.handle('c0', { t: 'start' });
  room.handle('c1', { t: 'leave' });
  room.handle('c0', { t: 'leave' }); // anche l'host "assente": giocano tutti da soli
  room.setConnected('c0', false);
  await clock.advance(60 * 60 * 1000);
  assert.equal(room.game.phase, 'over');
});

await test('ritmo veloce: allo scadere del timer la carta parte da sola', async () => {
  const { room, clock } = setup(2);
  room.handle('c0', { t: 'settings', settings: { timer: 2.5 } });
  room.handle('c0', { t: 'start' });
  await clock.advance(1600 + 2400);
  assert.equal(room.game.plays, 0);
  await clock.advance(200);
  assert.equal(room.game.plays, 1);
});

await test('schiaffi simultanei: vince il riflesso più rapido, non chi ha la rete migliore', async () => {
  const { room, clock } = setup(3);
  room.handle('c0', { t: 'start' });
  await clock.advance(2000);
  const g = room.game;
  // Preparo una doppia in cima.
  g.pile = [{ id: 'a', s: 'C', r: 5 }, { id: 'b', s: 'D', r: 5 }];
  const claim = { round: g.round, len: 2 };
  const before = room.game.players.map(p => p.hand.length);
  room.handle('c1', { t: 'slap', ...claim, rt: 420 }); // arriva prima ma più lento
  room.handle('c2', { t: 'slap', ...claim, rt: 310 }); // arriva dopo ma più veloce
  await clock.advance(300);
  const i2 = room.seatOf('c2'), i1 = room.seatOf('c1');
  assert.equal(g.players[i2].hand.length, before[i2] + 2);
  assert.equal(g.players[i1].hand.length, before[i1], 'chi era giusto ma più lento non paga');
  assert.equal(g.turn, i2);
});

await test('schiaffo a vuoto paga una carta', async () => {
  const { room, clock } = setup(2);
  room.handle('c0', { t: 'start' });
  await clock.advance(2000);
  const g = room.game;
  g.pile = [{ id: 'a', s: 'C', r: 5 }, { id: 'b', s: 'D', r: 6 }];
  const i = room.seatOf('c1');
  const before = g.players[i].hand.length;
  room.handle('c1', { t: 'slap', round: g.round, len: 2, rt: 100 });
  await clock.advance(300);
  assert.equal(g.players[i].hand.length, before - 1);
  assert.equal(g.under.length, 1);
});

await test('avatar: si sceglie entrando, si cambia anche in partita, valori strani ignorati', async () => {
  const { room, inbox } = setup(0);
  room.handle('a', { t: 'hello', name: 'Ada', avatar: 'svg:moka' });
  room.handle('b', { t: 'hello', name: 'Bea', avatar: 'emoji:🐱' });
  room.handle('c', { t: 'hello', name: 'Cic', avatar: '<img src=x onerror=alert(1)>' });
  room.handle('d', { t: 'hello', name: 'Dan' });
  const av = () => last(inbox, 'a', 'lobby').members.map(m => m.avatar);
  assert.deepEqual(av(), ['svg:moka', 'emoji:🐱', '', '']);
  room.handle('a', { t: 'start' });
  room.handle('d', { t: 'profile', avatar: 'svg:gatto' });
  room.handle('b', { t: 'profile', avatar: 'emoji:' + 'x'.repeat(30) });
  assert.deepEqual(av(), ['svg:moka', '', '', 'svg:gatto']);
});

await test('fine pagamento: tutti vedono l\'ultima carta, poi il creditore prende', async () => {
  const { room, clock, inbox } = setup(2);
  room.handle('c0', { t: 'start' });
  await clock.advance(2000);
  const g = room.game;
  const C = (r, s) => ({ id: s + r, s, r });
  const a = g.turn, b = 1 - a;
  g.players[a].hand = [C(1, 'C'), C(9, 'C')];
  g.players[b].hand = [C(5, 'D'), C(6, 'D')];
  room.handle(room.seats[a], { t: 'play' });          // asso: b deve 1
  await clock.advance(10);
  room.handle(room.seats[b], { t: 'play' });          // paga con il 5
  await clock.advance(10);
  let st = last(inbox, 'c0', 'state');
  assert.deepEqual(st.view.pile.map(c => c.r), [1, 5], 'il 5 si vede sul tavolo');
  assert.ok(st.events.some(e => e.type === 'reveal'));
  assert.ok(!st.events.some(e => e.type === 'collect'));
  room.handle(room.seats[b], { t: 'play' });          // durante la pausa non si gioca
  room.handle(room.seats[a], { t: 'play' });
  await clock.advance(500);
  assert.equal(g.pile.length, 2);
  await clock.advance(600);
  st = last(inbox, 'c0', 'state');
  assert.ok(st.events.some(e => e.type === 'collect' && e.p === a && e.n === 2));
  assert.equal(st.view.pile.length, 0);
  assert.equal(g.turn, a);
});

await test('durante la pausa lo schiaffo su una coppia vince sul creditore', async () => {
  const { room, clock } = setup(3);
  room.handle('c0', { t: 'start' });
  await clock.advance(2000);
  const g = room.game;
  const C = (r, s) => ({ id: s + r, s, r });
  const a = g.turn, b = (a + 1) % 3, c = (a + 2) % 3;
  g.players[a].hand = [C(2, 'C'), C(9, 'C')];
  g.players[b].hand = [C(6, 'D'), C(6, 'S'), C(8, 'D')];
  g.players[c].hand = [C(4, 'B'), C(4, 'C')];
  room.handle(room.seats[a], { t: 'play' }); await clock.advance(10);
  room.handle(room.seats[b], { t: 'play' }); await clock.advance(10);
  room.handle(room.seats[b], { t: 'play' }); await clock.advance(10);
  assert.ok(g.pending);
  await clock.advance(800);                             // schiaffo all'ultimo istante
  room.handle(room.seats[c], { t: 'slap', round: g.round, len: g.pile.length, rt: 700 });
  await clock.advance(1000);
  assert.equal(g.turn, c);
  assert.equal(g.players[c].hand.length, 2 + 3);
  assert.equal(g.players[a].hand.length, 1);
});

await test('fine partita: classifica, rivincita col mazziere successivo', async () => {
  const { room, clock, inbox } = setup(3, 7);
  room.handle('c0', { t: 'start' });
  const d1 = room.game.dealer;
  for (const c of ['c0', 'c1', 'c2']) room.setConnected(c, false);
  await clock.advance(24 * 3600 * 1000);
  const g = room.game;
  assert.equal(g.phase, 'over');
  const w = room.seats[g.winner];
  assert.equal(room.scores[w], 1);
  assert.equal(last(inbox, 'c0', 'lobby').members.find(m => m.cid === w).wins, 1);
  for (const c of ['c0', 'c1', 'c2']) room.handle(c, { t: 'hello', name: c });
  room.handle('c0', { t: 'start' });
  assert.equal(room.game.dealer, (d1 + 1) % 3);
});

await test('chi si ricollega riprende il suo posto', async () => {
  const { room, clock } = setup(3);
  room.handle('c0', { t: 'start' });
  room.setConnected('c2', false);
  room.handle('c2', { t: 'hello', name: 'nuovo nome' });
  assert.equal(room.members.get('c2').connected, true);
  assert.equal(room.members.get('c2').name, 'G2');
  assert.equal(room.order.length, 3);
});

console.log(`\n${passed} test superati`);
