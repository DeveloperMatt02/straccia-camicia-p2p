// Straccia Camicia — motore delle regole (puro, senza DOM, usabile anche in Node).
//
// Regole (da Wikipedia, "Straccia camicia"):
// - Mazzo italiano da 40 carte (coppe, denari, bastoni, spade), 2 o più giocatori.
// - Le carte si distribuiscono coperte a turno; nessuno guarda il proprio mazzetto.
// - A turno ognuno gira la prima carta del proprio mazzetto sul mazzetto comune.
// - Asso, 2 e 3 sono le carte "vincenti": il giocatore successivo deve pagare
//   1, 2 o 3 carte. Se durante il pagamento esce una carta vincente, l'obbligo
//   passa al giocatore successivo. Se il pagamento finisce senza carte vincenti,
//   chi ha giocato l'ultima carta vincente prende il mazzetto, lo mette sotto le
//   proprie carte e ricomincia.
// - Vince chi resta con tutte le carte.
// Varianti:
// - Schiaffo siciliano: due carte uguali consecutive → il primo che batte sul
//   mazzetto lo prende. Chi batte a vuoto paga 1 carta sotto il mazzetto.
// - Più mazzi (Super Camicia): 1, 2 o 3 mazzi da 40.
// - Il ritmo veloce (timer) è gestito dalla stanza, non dal motore.

export const SUITS = ['C', 'D', 'B', 'S']; // coppe, denari, bastoni, spade
export const SUIT_NAMES = { C: 'coppe', D: 'denari', B: 'bastoni', S: 'spade' };
export const RANK_NAMES = {
  1: 'Asso', 2: 'Due', 3: 'Tre', 4: 'Quattro', 5: 'Cinque', 6: 'Sei', 7: 'Sette',
  8: 'Fante', 9: 'Cavallo', 10: 'Re',
};

export const DEFAULT_RULES = {
  slap: false,        // schiaffo siciliano
  slapPenalty: 1,     // carte pagate per uno schiaffo sbagliato
  decks: 1,           // 1, 2 o 3 mazzi da 40
};

export function cardName(c) {
  return `${RANK_NAMES[c.r]} di ${SUIT_NAMES[c.s]}`;
}

export function payValue(card) {
  return card && card.r >= 1 && card.r <= 3 ? card.r : 0;
}

// Generatore pseudo-casuale con seme (mulberry32), per test riproducibili.
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildDeck(decks = 1) {
  const deck = [];
  for (let d = 0; d < decks; d++) {
    for (const s of SUITS) {
      for (let r = 1; r <= 10; r++) deck.push({ id: `${s}${r}.${d}`, s, r });
    }
  }
  return deck;
}

export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Crea una nuova partita.
 * players: [{ id, name }] nell'ordine di gioco.
 * dealer: indice di chi serve; gioca per primo il successivo, e le carte
 *         avanzate (quando non si dividono in parti uguali) vanno ai primi
 *         giocatori dopo il mazziere.
 */
export function createGame({ players, rules = {}, dealer = 0, rng = Math.random, deck = null }) {
  if (!players || players.length < 2) throw new Error('Servono almeno 2 giocatori');
  const r = { ...DEFAULT_RULES, ...rules };
  let cards = deck ? deck.map(c => ({ ...c })) : shuffle(buildDeck(r.decks), rng);
  let cut = null;
  if (!deck) {
    // "smezzate dal giocatore alla propria sinistra": taglio del mazzo
    cut = 5 + Math.floor(rng() * (cards.length - 10));
    cards = cards.slice(cut).concat(cards.slice(0, cut));
  }
  const n = players.length;
  const st = {
    players: players.map(p => ({ id: p.id, name: p.name, hand: [], out: false })),
    pile: [],          // carte scoperte al centro (indice 0 = prima giocata)
    under: [],         // carte pagate per schiaffi sbagliati, sotto il mazzetto
    round: 1,          // aumenta a ogni presa del mazzetto
    turn: (dealer + 1) % n,
    dealer,
    obligation: null,  // { owner, count, remaining }
    phase: 'playing',
    winner: null,
    draw: false,
    plays: 0,
    rules: r,
    cut,
    seen: {},          // stati già visti (per scovare le partite infinite)
  };
  cards.forEach((c, i) => st.players[(dealer + 1 + i) % n].hand.push(c));
  return st;
}

export function activeCount(st) {
  return st.players.filter(p => !p.out).length;
}

function finish(st, winner, events) {
  const w = st.players[winner];
  if (st.pile.length || st.under.length) {
    const n = st.pile.length + st.under.length;
    w.hand.push(...st.under, ...st.pile);
    st.under = []; st.pile = [];
    events.push({ type: 'collect', p: winner, n, reason: 'final' });
  }
  st.players.forEach((p, i) => { if (i !== winner) p.out = true; });
  st.phase = 'over';
  st.winner = winner;
  st.obligation = null;
  events.push({ type: 'win', p: winner });
}

// Passa il turno al prossimo giocatore con carte; chi tocca senza carte è fuori.
function advance(st, from, events) {
  const n = st.players.length;
  for (let k = 1; k < n; k++) {
    const j = (from + k) % n;
    const p = st.players[j];
    if (p.out) continue;
    if (p.hand.length === 0) {
      p.out = true;
      events.push({ type: 'out', p: j });
      continue;
    }
    st.turn = j;
    return;
  }
  // Nessun altro può giocare: vince `from`.
  finish(st, from, events);
}

function collect(st, j, reason, events) {
  const p = st.players[j];
  const n = st.pile.length + st.under.length;
  // Il mazzetto si gira e va sotto: la prima carta giocata resta in cima.
  p.hand.push(...st.under, ...st.pile);
  st.under = []; st.pile = [];
  st.round++;
  st.obligation = null;
  p.out = false;
  st.turn = j;
  events.push({ type: 'collect', p: j, n, reason });

  // Se nessun altro ha più carte, la partita è finita.
  const others = st.players.some((q, i) => i !== j && !q.out && q.hand.length > 0);
  if (!others) { finish(st, j, events); return; }

  // Partita infinita: senza schiaffi il gioco è deterministico, quindi se uno
  // stato a mazzetto vuoto si ripete, si ripeterà per sempre.
  if (!st.rules.slap) {
    const key = st.turn + '|' + st.players.map(q => q.hand.map(c => c.id).join(',')).join('/');
    if (st.seen[key]) {
      st.phase = 'over'; st.draw = true; st.winner = null;
      events.push({ type: 'infinite' });
      return;
    }
    st.seen[key] = 1;
  }
}

/** Il giocatore `pi` gira la prima carta del suo mazzetto. */
export function play(st, pi) {
  const events = [];
  if (st.phase !== 'playing') return { ok: false, error: 'La partita è finita', events };
  if (st.turn !== pi) return { ok: false, error: 'Non è il tuo turno', events };
  const p = st.players[pi];
  if (!p.hand.length) return { ok: false, error: 'Non hai carte', events };

  const card = p.hand.shift();
  st.pile.push(card);
  st.plays++;
  events.push({ type: 'play', p: pi, card });

  const v = payValue(card);
  if (v > 0) {
    st.obligation = { owner: pi, count: v, remaining: v };
    events.push({ type: 'demand', p: pi, n: v });
    advance(st, pi, events);
    if (st.phase === 'playing') st.obligation.debtor = st.turn;
  } else if (st.obligation) {
    st.obligation.remaining--;
    if (st.obligation.remaining === 0) {
      collect(st, st.obligation.owner, 'paid', events);
    } else if (!p.hand.length) {
      // Finite le carte durante il pagamento: il mazzetto va al creditore.
      events.push({ type: 'broke', p: pi });
      collect(st, st.obligation.owner, 'broke', events);
    }
  } else {
    advance(st, pi, events);
  }
  return { ok: true, events };
}

/** Le due carte in cima (alla lunghezza `len`) sono uguali? */
export function isDoubleAt(st, len) {
  return len >= 2 && len <= st.pile.length && st.pile[len - 1].r === st.pile[len - 2].r;
}

export function canSlap(st, pi) {
  return st.rules.slap && st.phase === 'playing' && !st.players[pi].out;
}

/**
 * Schiaffo siciliano. `claim` = { round, len }: lo stato del mazzetto visto da
 * chi batte. Restituisce kind: 'win' | 'wrong' | 'stale'.
 */
export function slap(st, pi, claim) {
  const events = [];
  if (!canSlap(st, pi)) return { ok: false, kind: 'stale', events };
  if (claim.round !== st.round) return { ok: false, kind: 'stale', events };
  if (isDoubleAt(st, claim.len)) {
    events.push({ type: 'slap', p: pi, ok: true });
    collect(st, pi, 'slap', events);
    return { ok: true, kind: 'win', events };
  }
  // Schiaffo a vuoto: paga sotto il mazzetto.
  const p = st.players[pi];
  const paid = [];
  for (let k = 0; k < st.rules.slapPenalty && p.hand.length; k++) {
    const c = p.hand.shift();
    st.under.push(c);
    paid.push(c);
  }
  events.push({ type: 'slap', p: pi, ok: false, paid: paid.length });
  if (st.turn === pi && !p.hand.length) {
    if (st.obligation) collect(st, st.obligation.owner, 'broke', events);
    else { p.out = true; events.push({ type: 'out', p: pi }); advance(st, pi, events); }
  }
  return { ok: true, kind: 'wrong', events };
}

/** Vista pubblica dello stato (senza il contenuto dei mazzetti coperti). */
export function publicView(st) {
  return {
    players: st.players.map(p => ({ id: p.id, name: p.name, count: p.hand.length, out: p.out })),
    pile: st.pile,
    under: st.under.length,
    round: st.round,
    turn: st.turn,
    dealer: st.dealer,
    obligation: st.obligation,
    phase: st.phase,
    winner: st.winner,
    draw: st.draw,
    plays: st.plays,
    rules: st.rules,
  };
}

export function totalCards(st) {
  return st.players.reduce((a, p) => a + p.hand.length, 0) + st.pile.length + st.under.length;
}
