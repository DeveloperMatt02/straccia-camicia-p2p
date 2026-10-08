// Collegamento tra i dispositivi. Chi crea la stanza la ospita (Room) e fa da
// tavolo; gli altri si collegano a lui con PeerJS (WebRTC, gratuito, senza server
// da pagare). Espone a tutti la stessa interfaccia: session.send(msg) e on(msg).
import { Room } from './room.js';
import { ICE_SERVERS, TURN_CREDENTIALS_URL, ROOM_PREFIX } from './config.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function randomCode(n = 4) {
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
export function normalizeCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}
function randomId() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}
// Un id per scheda: ricaricando la pagina si rientra nello stesso posto.
export function myCid() {
  try {
    let id = sessionStorage.getItem('sc-cid');
    if (!id) { id = randomId(); sessionStorage.setItem('sc-cid', id); }
    return id;
  } catch { return randomId(); }
}

// Server STUN fissi + server TURN chiesti al servizio configurato (se c'è).
// Se il servizio non risponde in pochi secondi si gioca lo stesso, solo con STUN.
let iceServers = ICE_SERVERS;
let iceReady = null;
export function loadIceServers(url = TURN_CREDENTIALS_URL, fetchImpl = globalThis.fetch) {
  if (!url) return Promise.resolve(ICE_SERVERS);
  if (iceReady) return iceReady;
  iceReady = (async () => {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetchImpl(url, { signal: ctrl.signal });
      clearTimeout(timer);
      const extra = r.ok ? await r.json() : null;
      if (Array.isArray(extra) && extra.length) iceServers = [...ICE_SERVERS, ...extra];
    } catch {
      iceReady = null; // riprovo alla prossima stanza
    }
    return iceServers;
  })();
  return iceReady;
}
export const hasTurn = () => iceServers.some(s => String(s.urls).includes('turn'));

function peerOptions() {
  return { debug: 1, config: { iceServers } };
}

// Errori come codici: l'interfaccia li traduce nella lingua di chi gioca.
const KNOWN = ['nolib', 'peer-unavailable', 'network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible', 'webrtc'];
export function errorCode(type) { return KNOWN.includes(type) ? type : 'generic'; }
function netError(type) { const e = new Error(errorCode(type)); e.code = errorCode(type); return e; }

// ---------------------------------------------------------------------------
// Host: crea la stanza e la tiene viva.
// ---------------------------------------------------------------------------
export function createHost({ name, onMessage, onStatus, code = randomCode(), attempts = 0 }) {
  return new Promise((resolve, reject) => {
    if (!window.Peer) return reject(netError('nolib'));
    const cid = myCid();
    const conns = new Map(); // cid → DataConnection
    const deliverLocal = m => queueMicrotask(() => onMessage(m));
    let closed = false;

    const room = new Room({
      hostCid: cid,
      send: (to, m) => {
        if (to === cid) deliverLocal(m);
        else { const c = conns.get(to); if (c?.open) try { c.send(m); } catch {} }
      },
      broadcast: m => {
        deliverLocal(m);
        for (const c of conns.values()) if (c.open) try { c.send(m); } catch {}
      },
    });

    const peer = new window.Peer(ROOM_PREFIX + code, peerOptions());
    let opened = false;

    peer.on('open', () => {
      opened = true;
      room.handle(cid, { t: 'hello', name });
      const tick = setInterval(() => { if (!closed) room.tick(); }, 2000);
      const session = {
        code, cid, isHost: true, room,
        send: m => room.handle(cid, m),
        close() {
          if (closed) return;
          closed = true; clearInterval(tick);
          for (const c of conns.values()) try { c.send({ t: 'closed' }); } catch {}
          setTimeout(() => peer.destroy(), 150);
        },
      };
      resolve(session);
    });

    peer.on('connection', conn => {
      let ccid = null;
      conn.on('data', m => {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'hello') {
          ccid = String(m.cid || conn.peer).slice(0, 40);
          const old = conns.get(ccid);
          if (old && old !== conn) try { old.close(); } catch {}
          conns.set(ccid, conn);
        }
        if (ccid) room.handle(ccid, m);
      });
      const gone = () => {
        if (ccid && conns.get(ccid) === conn) { conns.delete(ccid); room.setConnected(ccid, false); }
      };
      conn.on('close', gone);
      conn.on('error', gone);
    });

    // Se perdo il server di presentazione, le partite in corso continuano;
    // mi ricollego per far entrare altri giocatori.
    peer.on('disconnected', () => {
      if (closed) return;
      onStatus?.('reconnecting');
      setTimeout(() => { if (!closed && !peer.destroyed) try { peer.reconnect(); } catch {} }, 1500);
    });

    peer.on('error', err => {
      if (!opened && err.type === 'unavailable-id' && attempts < 5) {
        peer.destroy();
        createHost({ name, onMessage, onStatus, attempts: attempts + 1 }).then(resolve, reject);
        return;
      }
      if (!opened) { peer.destroy(); reject(netError(err.type)); return; }
      if (err.type !== 'peer-unavailable') onStatus?.('error', errorCode(err.type));
    });
  });
}

// ---------------------------------------------------------------------------
// Ospite: si collega alla stanza e si ricollega da solo se cade la linea.
// ---------------------------------------------------------------------------
export function joinRoom({ code, name, onMessage, onStatus }) {
  return new Promise((resolve, reject) => {
    if (!window.Peer) return reject(netError('nolib'));
    const cid = myCid();
    const peer = new window.Peer(peerOptions());
    let conn = null, settled = false, closed = false;
    let lastHeard = Date.now(), retrying = false, retryTimer = null, tries = 0;

    const session = {
      code, cid, isHost: false,
      send: m => { if (conn?.open) try { conn.send(m); } catch {} },
      close() {
        if (closed) return;
        closed = true;
        clearInterval(watch); clearTimeout(retryTimer);
        try { conn?.send({ t: 'leave' }); } catch {}
        setTimeout(() => peer.destroy(), 150);
      },
    };

    function connect() {
      const c = peer.connect(ROOM_PREFIX + code, { reliable: true, serialization: 'json', metadata: { cid } });
      conn = c;
      const openTimeout = setTimeout(() => {
        if (!c.open && !settled) fail('webrtc');
      }, 15000);
      c.on('open', () => {
        clearTimeout(openTimeout);
        tries = 0; retrying = false; lastHeard = Date.now();
        c.send({ t: 'hello', name, cid });
        onStatus?.('online');
        if (!settled) { settled = true; resolve(session); }
      });
      c.on('data', m => {
        lastHeard = Date.now();
        if (!m || typeof m !== 'object') return;
        if (m.t === 'ping') { c.send({ t: 'pong' }); return; }
        if (m.t === 'closed') { closed = true; onStatus?.('closed'); return; }
        onMessage(m);
      });
      c.on('close', () => { if (conn === c) lost(); });
      c.on('error', () => { if (conn === c) lost(); });
    }

    function fail(type) {
      if (settled) return;
      settled = true; closed = true;
      clearInterval(watch);
      peer.destroy();
      reject(netError(type));
    }

    function lost() {
      if (closed || !settled || retrying) return;
      retrying = true;
      onStatus?.('reconnecting');
      const retry = () => {
        if (closed) return;
        if (++tries > 30) { onStatus?.('lost'); closed = true; return; }
        if (peer.disconnected && !peer.destroyed) try { peer.reconnect(); } catch {}
        try { conn?.close(); } catch {}
        connect();
        retryTimer = setTimeout(() => { if (retrying && !closed) retry(); }, 3000);
      };
      retry();
    }

    // Se l'host tace troppo a lungo (telefono bloccato, rete caduta) riprovo.
    const watch = setInterval(() => {
      if (settled && !closed && !retrying && Date.now() - lastHeard > 7000) lost();
    }, 1500);

    peer.on('open', connect);
    peer.on('disconnected', () => { if (!closed) setTimeout(() => { try { if (!peer.destroyed) peer.reconnect(); } catch {} }, 1000); });
    peer.on('error', err => {
      if (!settled) fail(err.type);
      else if (err.type === 'peer-unavailable' && retrying) { /* l'host non c'è ancora: riprovo */ }
    });
  });
}

// ---------------------------------------------------------------------------
// Modalità prova: tutto in locale, con giocatori finti (?prova nell'indirizzo).
// Utile per vedere il gioco da soli, senza rete.
// ---------------------------------------------------------------------------
export function createPractice({ name, bots = 3, onMessage, settings }) {
  const cid = myCid();
  const botIds = Array.from({ length: bots }, (_, i) => 'bot' + i);
  const botNames = ['Nonna Pina', 'Zio Gino', 'Carmela', 'Totò', 'Ugo'];
  const views = {};
  const room = new Room({
    hostCid: cid,
    send: (to, m) => { if (to === cid) queueMicrotask(() => onMessage(m)); else botSee(to, m); },
    broadcast: m => { queueMicrotask(() => onMessage(m)); botIds.forEach(b => botSee(b, m)); },
  });
  let botTimers = [];
  function botSee(b, m) {
    if (m.t !== 'state') return;
    views[b] = m;
    const v = m.view;
    const i = m.seats.indexOf(b);
    if (i < 0 || v.phase !== 'playing') return;
    if (v.rules.slap && v.pile.length >= 2 && v.pile.at(-1).r === v.pile.at(-2).r && Math.random() < 0.55) {
      const rt = 350 + Math.random() * 700;
      const claim = { round: v.round, len: v.pile.length };
      botTimers.push(setTimeout(() => room.handle(b, { t: 'slap', ...claim, rt }), rt));
    }
    if (v.turn === i) {
      const delay = (m.lockMs || 0) + 450 + Math.random() * 650;
      botTimers.push(setTimeout(() => room.handle(b, { t: 'play' }), delay));
    }
    if (Math.random() < 0.04 && m.events.some(e => e.type === 'collect' && e.p === i)) {
      const lines = ['p:pay', 'p:shirt', '😂', '🔥'];
      setTimeout(() => room.handle(b, { t: 'emoji', e: lines[Math.floor(Math.random() * lines.length)] }), 500);
    }
  }
  room.handle(cid, { t: 'hello', name });
  botIds.forEach((b, i) => room.handle(b, { t: 'hello', name: botNames[i] }));
  if (settings) room.handle(cid, { t: 'settings', settings });
  const tick = setInterval(() => {
    for (const b of botIds) { const m = room.members.get(b); if (m) m.lastSeen = Date.now(); }
    room.tick();
  }, 2000);
  return {
    code: 'PROVA', cid, isHost: true, practice: true, room,
    send: m => room.handle(cid, m),
    close() { clearInterval(tick); botTimers.forEach(clearTimeout); },
  };
}
