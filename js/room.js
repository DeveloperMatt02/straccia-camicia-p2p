// La stanza: gira sul dispositivo di chi la crea (host) ed è l'arbitro della partita.
// Non conosce la rete: riceve messaggi con handle(cid, msg) e risponde con send/broadcast.
import { createGame, play, slap, resolvePending, publicView, makeRng } from './engine.js';

export const MAX_PLAYERS = 6;
export const TIMER_OPTIONS = [0, 6, 2.5];      // secondi: nessuno, normale, calabrese
const SLAP_WINDOW = 250;                       // ms per raccogliere schiaffi quasi simultanei
const COLLECT_PAUSE = 1100;                    // ms di pausa dopo una presa
export const REVEAL_PAUSE = 1000;              // ms in cui resta visibile l'ultima carta prima della presa
const DISCONNECTED_AUTOPLAY = 1300;            // ms prima di giocare al posto di chi è disconnesso
const DEFAULT_SETTINGS = { slap: true, timer: 0, decks: 1, penitence: true };

// Avatar: '' = iniziale del nome, 'svg:<nome>' = disegno, 'emoji:<emoji>'.
// La stanza controlla solo la forma: ogni schermo sa come disegnarlo.
export function cleanAvatar(a) {
  a = typeof a === 'string' ? a : '';
  if (/^svg:[a-z0-9-]{1,20}$/.test(a)) return a;
  if (/^emoji:\S{1,12}$/u.test(a) && [...a.slice(6)].length <= 6) return a;
  return '';
}
export class Room {
  constructor({ hostCid, send, broadcast, timers = globalThis, now = () => Date.now(), seed }) {
    this.hostCid = hostCid;
    this.send = send;
    this.broadcastRaw = broadcast;
    this.t = timers;
    this.now = now;
    this.rng = seed != null ? makeRng(seed) : Math.random;
    this.members = new Map();       // cid → { cid, name, connected, joinedAt }
    this.order = [];                // cid in ordine di posto
    this.settings = { ...DEFAULT_SETTINGS };
    this.scores = {};               // cid → partite vinte
    this.game = null;
    this.seats = [];                // indice giocatore → cid
    this.gamesPlayed = 0;
    this.lockUntil = 0;
    this.turnTimer = null;
    this.turnDeadline = 0;
    this.slapBuffer = [];
    this.slapTimer = null;
    this.pendingTimer = null;
    this.lastEvents = [];
  }

  // ---------- messaggi in arrivo ----------
  handle(cid, msg) {
    const m = this.members.get(cid);
    if (m) m.lastSeen = this.now();
    switch (msg.t) {
      case 'hello': return this.onHello(cid, msg);
      case 'profile': return this.onProfile(cid, msg);
      case 'pong': return;
      case 'settings': if (cid === this.hostCid && !this.inGame()) this.onSettings(msg.settings); return;
      case 'start': if (cid === this.hostCid) this.startGame(); return;
      case 'toLobby': if (cid === this.hostCid && this.game?.phase === 'over') { this.game = null; this.clearPendingTimer(); this.pushLobby(); } return;
      case 'kick': if (cid === this.hostCid && msg.cid !== this.hostCid && !this.inGame()) this.removeMember(msg.cid, 'kicked'); return;
      case 'play': return this.onPlay(cid);
      case 'slap': return this.onSlap(cid, msg);
      case 'emoji': return this.onEmoji(cid, msg);
      case 'leave': return this.onLeave(cid);
    }
  }

  inGame() { return !!this.game && this.game.phase === 'playing'; }

  onHello(cid, { name, avatar }) {
    avatar = cleanAvatar(avatar);
    name = String(name || 'Giocatore').trim().slice(0, 16) || 'Giocatore';
    let m = this.members.get(cid);
    if (m) {
      if (!this.inGame()) m.name = name;
      m.avatar = avatar;
      this.setConnected(cid, true);
    } else {
      if (this.order.length >= MAX_PLAYERS) {
        this.send(cid, { t: 'error', code: 'full' });
        return;
      }
      // Nomi doppi: aggiungo un numero.
      const taken = new Set([...this.members.values()].map(x => x.name.toLowerCase()));
      let base = name, k = 2;
      while (taken.has(name.toLowerCase())) name = `${base} ${k++}`;
      m = { cid, name, avatar, connected: true, lastSeen: this.now(), joinedAt: this.now() };
      this.members.set(cid, m);
      this.order.push(cid);
      this.scores[cid] ??= 0;
    }
    this.send(cid, { t: 'welcome', you: cid, host: this.hostCid });
    this.pushLobby();
    if (this.game) this.sendState(cid);
  }

  // L'avatar si può cambiare in qualsiasi momento, anche durante la partita.
  onProfile(cid, { avatar }) {
    const m = this.members.get(cid);
    if (!m) return;
    avatar = cleanAvatar(avatar);
    if (m.avatar === avatar) return;
    m.avatar = avatar;
    this.pushLobby();
  }

  onSettings(s = {}) {
    const next = { ...this.settings };
    if (typeof s.slap === 'boolean') next.slap = s.slap;
    if (typeof s.penitence === 'boolean') next.penitence = s.penitence;
    if (TIMER_OPTIONS.includes(s.timer)) next.timer = s.timer;
    if ([1, 2, 3].includes(s.decks)) next.decks = s.decks;
    this.settings = next;
    this.pushLobby();
  }

  onLeave(cid) {
    if (this.inGame() && this.seats.includes(cid)) {
      // Le sue carte restano in gioco: giocano da sole finché non torna.
      this.setConnected(cid, false);
    } else {
      this.removeMember(cid, 'left');
    }
  }

  removeMember(cid, reason) {
    if (!this.members.has(cid)) return;
    this.members.delete(cid);
    this.order = this.order.filter(x => x !== cid);
    if (reason === 'kicked') this.send(cid, { t: 'error', code: 'kicked' });
    this.pushLobby();
  }

  setConnected(cid, on) {
    const m = this.members.get(cid);
    if (!m || m.connected === on) return;
    m.connected = on;
    if (on) m.lastSeen = this.now();
    this.pushLobby();
    if (this.game) { this.broadcastState([]); this.scheduleTurn(); }
  }

  // ---------- partita ----------
  startGame() {
    if (this.inGame()) return;
    const cids = this.order.filter(c => this.members.get(c)?.connected);
    if (cids.length < 2) {
      this.send(this.hostCid, { t: 'toast', code: 'need2' });
      return;
    }
    this.seats = cids;
    this.clearPendingTimer();
    const dealer = this.gamesPlayed % cids.length; // a ogni partita serve il successivo
    this.game = createGame({
      players: cids.map(c => ({ id: c, name: this.members.get(c).name })),
      rules: { slap: this.settings.slap, decks: this.settings.decks, slapPenalty: 1 },
      dealer,
      rng: this.rng,
    });
    this.gamesPlayed++;
    this.lockUntil = this.now() + 1600; // tempo per l'animazione della distribuzione
    this.pushLobby();
    this.broadcastState([{ type: 'deal', dealer, cut: this.game.cut }]);
    this.scheduleTurn();
  }

  seatOf(cid) { return this.seats.indexOf(cid); }

  onPlay(cid, auto = false) {
    const g = this.game;
    if (!g || g.phase !== 'playing') return;
    const i = this.seatOf(cid);
    if (i < 0 || g.turn !== i) return;
    if (this.now() < this.lockUntil) return;
    const r = play(g, i);
    if (!r.ok) return;
    if (auto) r.events[0].auto = true;
    this.afterEvents(r.events);
  }

  onSlap(cid, { round, len, rt }) {
    const g = this.game;
    if (!g || g.phase !== 'playing' || !g.rules.slap) return;
    const i = this.seatOf(cid);
    if (i < 0 || g.players[i].out) return;
    if (this.slapBuffer.some(s => s.i === i)) return;
    rt = Number.isFinite(rt) ? Math.max(0, Math.min(rt, 60000)) : 60000;
    this.slapBuffer.push({ i, claim: { round: Number(round), len: Number(len) }, rt });
    if (!this.slapTimer) this.slapTimer = this.t.setTimeout(() => this.resolveSlaps(), SLAP_WINDOW);
  }

  // Tra gli schiaffi giusti arrivati nella finestra vince chi ha reagito più in
  // fretta (tempo misurato sul proprio dispositivo, così la rete non conta).
  resolveSlaps() {
    this.slapTimer = null;
    const g = this.game;
    const buf = this.slapBuffer; this.slapBuffer = [];
    if (!g || g.phase !== 'playing') return;
    const events = [];
    const current = buf.filter(s => s.claim.round === g.round);
    const right = current.filter(s => s.claim.len >= 2 && s.claim.len <= g.pile.length &&
      g.pile[s.claim.len - 1].r === g.pile[s.claim.len - 2].r);
    const wrong = current.filter(s => !right.includes(s));
    for (const s of wrong) {
      if (g.phase !== 'playing') break;
      events.push(...slap(g, s.i, s.claim).events);
    }
    if (right.length && g.phase === 'playing') {
      right.sort((a, b) => a.rt - b.rt);
      const w = right[0];
      const r = slap(g, w.i, w.claim);
      r.events.forEach(e => { if (e.type === 'slap') { e.rt = Math.round(w.rt); e.beaten = right.slice(1).map(x => x.i); } });
      events.push(...r.events);
    }
    if (events.length) this.afterEvents(events);
  }

  afterEvents(events) {
    const g = this.game;
    if (events.some(e => e.type === 'collect')) this.lockUntil = this.now() + COLLECT_PAUSE;
    // Presa in sospeso: lascio vedere a tutti l'ultima carta, poi si prende.
    if (g.pending && g.phase === 'playing') {
      this.lockUntil = Math.max(this.lockUntil, this.now() + REVEAL_PAUSE);
      if (!this.pendingTimer) this.pendingTimer = this.t.setTimeout(() => this.onPendingDue(g), REVEAL_PAUSE);
    } else {
      this.clearPendingTimer();
    }
    if (g.phase === 'over') {
      if (g.winner != null) {
        const w = this.seats[g.winner];
        this.scores[w] = (this.scores[w] || 0) + 1;
      }
      this.clearTurnTimer();
      this.broadcastState(events);
      this.pushLobby();
      return;
    }
    this.broadcastState(events);
    this.scheduleTurn();
  }

  onPendingDue(g) {
    this.pendingTimer = null;
    if (this.game !== g || !g.pending || g.phase !== 'playing') return;
    // Se c'è uno schiaffo in arrivo, prima si decide quello.
    if (this.slapTimer) { this.pendingTimer = this.t.setTimeout(() => this.onPendingDue(g), 60); return; }
    const r = resolvePending(g);
    if (r.ok) this.afterEvents(r.events);
  }

  clearPendingTimer() {
    if (this.pendingTimer) this.t.clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
  }

  clearTurnTimer() {
    if (this.turnTimer) this.t.clearTimeout(this.turnTimer);
    this.turnTimer = null; this.turnDeadline = 0;
  }

  // Timer del turno: gioca da solo chi è disconnesso o (col ritmo veloce) chi è lento.
  scheduleTurn() {
    this.clearTurnTimer();
    const g = this.game;
    if (!g || g.phase !== 'playing' || g.pending) return;
    const cid = this.seats[g.turn];
    const m = this.members.get(cid);
    const wait = Math.max(0, this.lockUntil - this.now());
    let delay = null;
    if (!m || !m.connected) delay = wait + DISCONNECTED_AUTOPLAY;
    else if (this.settings.timer > 0) delay = wait + this.settings.timer * 1000;
    if (delay == null) return;
    this.turnDeadline = this.now() + delay;
    const turnAt = g.plays;
    this.turnTimer = this.t.setTimeout(() => {
      this.turnTimer = null;
      if (this.game === g && g.phase === 'playing' && g.plays === turnAt) this.onPlay(cid, true);
    }, delay);
  }

  onEmoji(cid, { e }) {
    // e è un'emoji oppure un codice frase ("p:pay") che ognuno traduce nella sua lingua.
    if (typeof e !== 'string' || e.length > 40) return;
    const m = this.members.get(cid);
    if (!m) return;
    const t = this.now();
    if (m.lastEmoji && t - m.lastEmoji < 700) return; // niente spam
    m.lastEmoji = t;
    this.broadcastRaw({ t: 'emoji', cid, e });
  }

  // ---------- messaggi in uscita ----------
  lobbyView() {
    return {
      t: 'lobby',
      host: this.hostCid,
      members: this.order.map(c => {
        const m = this.members.get(c);
        return { cid: c, name: m.name, avatar: m.avatar || '', connected: m.connected, wins: this.scores[c] || 0 };
      }),
      settings: this.settings,
      inGame: this.inGame(),
      hasGame: !!this.game,
      gamesPlayed: this.gamesPlayed,
    };
  }

  pushLobby() { this.broadcastRaw(this.lobbyView()); }

  stateMsg(events) {
    const g = this.game;
    return {
      t: 'state',
      view: publicView(g),
      seats: this.seats,
      connected: this.seats.map(c => !!this.members.get(c)?.connected),
      events,
      lockMs: Math.max(0, this.lockUntil - this.now()),
      deadlineMs: this.turnDeadline ? Math.max(0, this.turnDeadline - this.now()) : 0,
      settings: this.settings,
    };
  }

  broadcastState(events) {
    this.lastEvents = events;
    // Il timer viene calcolato dopo: mando lo stato una volta pianificato il turno.
    queueMicrotask(() => this.broadcastRaw(this.stateMsg(events)));
  }

  sendState(cid) { this.send(cid, this.stateMsg([])); }

  // ---------- presenza ----------
  // Da chiamare ogni ~2 s: segna disconnesso chi non si fa sentire.
  tick() {
    const t = this.now();
    for (const m of this.members.values()) {
      if (m.cid === this.hostCid) continue;
      if (m.connected && t - (m.lastSeen || 0) > 7000) this.setConnected(m.cid, false);
    }
    this.broadcastRaw({ t: 'ping' });
  }
}
