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

console.log(`\n${passed} test superati`);
