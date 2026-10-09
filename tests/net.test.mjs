// Test del caricamento dei server TURN: node tests/net.test.mjs
import assert from 'node:assert/strict';

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('ok  -', name); }
  catch (e) { console.error('FAIL-', name); throw e; }
}
// Ogni test usa una copia nuova del modulo, perché tiene in memoria il risultato.
const fresh = async () => import(`../js/net.js?${Math.random()}`);
const TURN = [{ urls: 'turn:global.relay.metered.ca:80', username: 'u', credential: 'p' }];

await test('senza indirizzo si usano solo i server STUN', async () => {
  const net = await fresh();
  const ice = await net.loadIceServers('', () => { throw new Error('non deve chiamare'); });
  assert.ok(ice.every(s => s.urls.startsWith('stun:')));
  assert.equal(net.hasTurn(), false);
});

await test('con il servizio che risponde si aggiungono i server TURN', async () => {
  const net = await fresh();
  let calls = 0;
  const fakeFetch = async () => { calls++; return { ok: true, json: async () => TURN }; };
  const ice = await net.loadIceServers('https://x.metered.live/api/v1/turn/credentials?apiKey=k', fakeFetch);
  assert.ok(ice.some(s => s.urls.startsWith('stun:')), 'tiene anche STUN');
  assert.deepEqual(ice.at(-1), TURN[0]);
  assert.equal(net.hasTurn(), true);
  await net.loadIceServers('https://x.metered.live/api/v1/turn/credentials?apiKey=k', fakeFetch);
  assert.equal(calls, 1, 'le credenziali si chiedono una volta sola');
});

await test('se il servizio non risponde si gioca lo stesso con STUN, e si riprova dopo', async () => {
  const net = await fresh();
  let calls = 0;
  const down = async () => { calls++; throw new Error('rete giù'); };
  const ice = await net.loadIceServers('https://x/creds', down);
  assert.ok(ice.length >= 1 && !net.hasTurn());
  await net.loadIceServers('https://x/creds', down);
  assert.equal(calls, 2);
});

await test('una risposta di errore (es. chiave sbagliata) non blocca il gioco', async () => {
  const net = await fresh();
  const ice = await net.loadIceServers('https://x/creds', async () => ({ ok: false, json: async () => ({ error: 'bad key' }) }));
  assert.ok(ice.length >= 1 && !net.hasTurn());
});

// Orologio finto per il ricollegamento al server di presentazione.
function fakeTimers() {
  let now = 0, id = 0; const q = new Map();
  return {
    setTimeout: (fn, ms) => { q.set(++id, { at: now + ms, fn }); return id; },
    clearTimeout: k => q.delete(k),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [k, v] of q) if (v.at <= end && (!next || v.at < next[1].at)) next = [k, v];
        if (!next) break;
        q.delete(next[0]); now = next[1].at; next[1].fn();
      }
      now = end;
    },
  };
}
function fakePeer() {
  return { disconnected: false, destroyed: false, reconnects: 0, reconnect() { this.reconnects++; } };
}

await test('server di presentazione: un calo breve non mostra nessun avviso', async () => {
  const net = await fresh();
  const timers = fakeTimers(), peer = fakePeer(), log = [];
  const s = net.keepSignaling(peer, { timers, onDown: () => log.push('down'), onUp: () => log.push('up') });
  peer.disconnected = true; s.down();
  timers.advance(1600);
  assert.equal(peer.reconnects, 1, 'riprova da solo');
  peer.disconnected = false; s.up();                 // PeerJS rimanda 'open'
  timers.advance(10000);
  assert.deepEqual(log, [], 'nessun avviso e niente da togliere');
});

await test('server di presentazione: se il calo dura arriva l\'avviso, e sparisce al ritorno', async () => {
  const net = await fresh();
  const timers = fakeTimers(), peer = fakePeer(), log = [];
  const s = net.keepSignaling(peer, { timers, onDown: () => log.push('down'), onUp: () => log.push('up') });
  peer.disconnected = true;
  s.down();
  timers.advance(1500); s.down();                    // il tentativo fallisce: PeerJS rimanda 'disconnected'
  timers.advance(3000); s.down();
  timers.advance(1000);
  assert.deepEqual(log, ['down']);
  assert.ok(peer.reconnects >= 2, 'continua a riprovare');
  for (let k = 0; k < 10; k++) { timers.advance(20000); s.down(); }
  assert.ok(peer.reconnects >= 10, 'non smette mai di riprovare');
  peer.disconnected = false; s.up();
  assert.deepEqual(log, ['down', 'up']);
  s.down(); peer.disconnected = true;
  timers.advance(4000);
  assert.deepEqual(log, ['down', 'up'], 'il conteggio riparte da capo');
});

await test('server di presentazione: chiusa la stanza non riprova più', async () => {
  const net = await fresh();
  const timers = fakeTimers(), peer = fakePeer();
  let closed = false;
  const s = net.keepSignaling(peer, { timers, isClosed: () => closed });
  peer.disconnected = true; s.down();
  closed = true;
  timers.advance(60000);
  assert.equal(peer.reconnects, 0);
});

console.log(`\n${passed} test superati`);
