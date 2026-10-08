// Interfaccia di Straccia Camicia: schermate, tavolo, animazioni e comandi.
import { installSprite, cardSVG, backSVG, STYLES } from './cards.js';
import { createHost, joinRoom, createPractice, normalizeCode } from './net.js';
import { sfx, unlock, setSound, setVibrate } from './audio.js';
import { payValue } from './engine.js';
import { t, nCards, cardLabel, setLang, getLang, detectLang, applyStatic, LANGS } from './i18n.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = s => { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const hueOf = name => hash(name) % 360;
const initial = name => (String(name).trim()[0] || '?').toUpperCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Preferenze locali
// ---------------------------------------------------------------------------
const prefs = Object.assign({ name: '', style: 'napoletano', sound: true, vibrate: true, lang: null },
  (() => { try { return JSON.parse(localStorage.getItem('sc-prefs') || '{}'); } catch { return {}; } })());
function savePrefs() { try { localStorage.setItem('sc-prefs', JSON.stringify(prefs)); } catch {} }
setSound(prefs.sound); setVibrate(prefs.vibrate);
setLang(detectLang(prefs.lang));
const card = (c, style = prefs.style) => cardSVG(c, style, n => t('pay', { n }));

// ---------------------------------------------------------------------------
// Stato dell'app
// ---------------------------------------------------------------------------
let session = null;      // collegamento attivo
let myCid = null;
let lobby = null;        // ultimo messaggio 'lobby'
let game = null;         // ultimo messaggio 'state'
let myIndex = -1;
let seenAt = {};         // "round:len" → istante in cui ho visto quel mazzetto (per i riflessi)
let flash = null;        // messaggio temporaneo al centro
let flashTimer = null;
let lockTimer = null;
let endTimer = null;
let wakeLock = null;

// ---------------------------------------------------------------------------
// Schermate
// ---------------------------------------------------------------------------
function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== 'screen-' + name;
  document.body.dataset.screen = name;
  if (name === 'game') { requestWakeLock(); requestAnimationFrame(layoutSeats); }
}
const current = () => document.body.dataset.screen;

let toastTimer = null;
function toast(text, ms = 2600) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function banner(text) { const b = $('#banner'); b.hidden = !text; b.textContent = text || ''; }

function cardEl(card, { back = false } = {}) {
  const d = document.createElement('div');
  d.className = 'card';
  d.innerHTML = back ? backSVG() : cardSVG(card, prefs.style, n => t('pay', { n }));
  if (!back) { d.dataset.id = card.id; d.setAttribute('aria-label', cardLabel(card)); }
  return d;
}

// ---------------------------------------------------------------------------
// INIZIO
// ---------------------------------------------------------------------------
function renderHero() {
  const fan = $('#hero-fan');
  fan.innerHTML = '';
  const cards = [{ s: 'B', r: 3 }, { s: 'D', r: 2 }, { s: 'C', r: 1 }];
  const rots = [-20, -7, 6, 19];
  [...cards, null].forEach((c, i) => {
    const el = cardEl(c || {}, { back: !c });
    el.style.transform = `translateX(-50%) rotate(${rots[i]}deg)`;
    el.style.animationDelay = `${i * 90}ms`;
    fan.appendChild(el);
  });
}

function homeError(text) { $('#home-error').textContent = text || ''; }

function readName() {
  const n = $('#in-name').value.trim();
  if (!n) { homeError(t('home.err.name')); $('#in-name').focus(); return null; }
  prefs.name = n; savePrefs(); homeError('');
  return n;
}

function setBusy(on, label) {
  for (const b of document.querySelectorAll('#screen-home .btn')) b.disabled = on;
  if (label) homeError(''), $('#home-error').textContent = on ? label : '';
  $('#home-error').style.color = on ? 'var(--muted)' : '';
}

// La libreria PeerJS arriva da un CDN gratuito (con riserva).
function loadPeer() {
  if (window.Peer) return Promise.resolve();
  const urls = ['https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js', 'https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js'];
  return urls.reduce((p, url) => p.catch(() => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = url; s.onload = () => (window.Peer ? res() : rej()); s.onerror = rej;
    document.head.appendChild(s);
  })), Promise.reject()).catch(() => { const e = new Error('nolib'); e.code = 'nolib'; throw e; });
}

async function doCreate() {
  const name = readName(); if (!name) return;
  unlock();
  setBusy(true, t('home.opening'));
  try {
    await loadPeer();
    session = await createHost({ name, onMessage, onStatus });
    myCid = session.cid;
    window.__scSession = session; // utile per i test automatici
    setBusy(false);
    show('lobby'); renderLobby();
  } catch (e) { setBusy(false); homeError(t('err.' + (e.code || 'generic'))); }
}

async function doJoin(code) {
  const name = readName(); if (!name) return;
  code = normalizeCode(code);
  if (code.length !== 4) { homeError(t('home.err.code')); $('#in-code').focus(); return; }
  unlock();
  setBusy(true, t('home.joining', { code }));
  try {
    await loadPeer();
    session = await joinRoom({ code, name, onMessage, onStatus });
    myCid = session.cid;
    try { sessionStorage.setItem('sc-joined', code); } catch {}
    history.replaceState(null, '', '?stanza=' + code);
    setBusy(false);
    if (!game) show('lobby');
    renderLobby();
  } catch (e) { setBusy(false); homeError(t('err.' + (e.code || 'generic'))); }
}

function doPractice() {
  const name = readName(); if (!name) return;
  unlock();
  session = createPractice({ name, bots: 3, onMessage });
  myCid = session.cid;
  window.__scPractice = session; // utile per i test automatici
  show('lobby'); renderLobby();
}

function leave(message) {
  try { session?.close(); } catch {}
  session = null; lobby = null; game = null; myIndex = -1; seenAt = {};
  clearTimeout(endTimer);
  $('#overlay-end').hidden = true;
  closeSheet(); banner('');
  try { sessionStorage.removeItem('sc-joined'); } catch {}
  history.replaceState(null, '', location.pathname);
  releaseWakeLock();
  show('home');
  setBusy(false);
  homeError(message || '');
}

// ---------------------------------------------------------------------------
// Messaggi dalla stanza
// ---------------------------------------------------------------------------
function onMessage(m) {
  switch (m.t) {
    case 'welcome': myCid = m.you; break;
    case 'lobby': onLobby(m); break;
    case 'state': onState(m); break;
    case 'emoji': showBubble(m.cid, m.e); break;
    case 'toast': toast(t('room.' + m.code)); break;
    case 'error':
      if (m.code === 'full' || m.code === 'kicked') leave(t('room.' + m.code));
      else toast(t('err.generic'));
      break;
  }
}

function onStatus(kind, text) {
  if (kind === 'reconnecting') banner(t(session?.isHost ? 'net.reconnectHost' : 'net.reconnect'));
  else if (kind === 'online') banner('');
  else if (kind === 'closed') leave(t('net.closed'));
  else if (kind === 'lost') leave(t('net.lost'));
  else if (kind === 'error' && text) toast(t('err.' + text));
}

// ---------------------------------------------------------------------------
// STANZA
// ---------------------------------------------------------------------------
const isHost = () => !!lobby && lobby.host === myCid;
const memberName = cid => lobby?.members.find(m => m.cid === cid)?.name || t('someone');

function onLobby(m) {
  lobby = m;
  renderLobby();
  if (!m.hasGame) {
    if (game) { game = null; $('#overlay-end').hidden = true; clearTimeout(endTimer); }
    if (current() !== 'lobby') show('lobby');
  } else if (!$('#overlay-end').hidden) {
    renderEnd();
  }
}

function renderLobby() {
  if (!lobby) return;
  const code = session?.practice ? t('practice.code') : (session?.code || '');
  $('#room-code').innerHTML = code.split('').map(ch => `<span class="tile">${esc(ch)}</span>`).join('');
  const host = isHost();
  $('#room-hint').textContent = session?.practice ? t('lobby.hintPractice')
    : host ? t('lobby.hintHost') : t('lobby.hintGuest', { host: memberName(lobby.host) });
  $('#btn-share').hidden = !!session?.practice;

  const list = $('#lobby-players');
  const max = 6;
  $('#seat-count').textContent = t('lobby.seats', { n: lobby.members.length, max });
  list.innerHTML = lobby.members.map(p => `
    <li class="${p.connected ? '' : 'off'}">
      <span class="avatar" style="--h:${hueOf(p.name)}">${esc(initial(p.name))}</span>
      <span class="name">${esc(p.name)}${p.cid === myCid ? ` <span class="tag">${t('lobby.you')}</span>` : ''}
        ${p.cid === lobby.host ? ` <span class="tag">${t('lobby.opens')}</span>` : ''}
        ${p.connected ? '' : ` <span class="tag">${t('lobby.offline')}</span>`}</span>
      ${p.wins ? `<span class="wins" title="${t('lobby.wins')}">${p.wins}</span>` : ''}
      ${host && p.cid !== myCid && !lobby.inGame ? `<button class="kick" data-kick="${esc(p.cid)}" aria-label="${t('lobby.kick', { name: esc(p.name) })}">×</button>` : ''}
    </li>`).join('') +
    (lobby.members.length < max ? `<li class="empty">${max - lobby.members.length === 1 ? t('lobby.free1') : t('lobby.freeN', { n: max - lobby.members.length })}</li>` : '');

  renderRulesForm();

  const connected = lobby.members.filter(p => p.connected).length;
  const start = $('#btn-start');
  start.hidden = !host;
  start.disabled = connected < 2 || lobby.inGame;
  start.textContent = t(lobby.gamesPlayed ? 'lobby.dealAgain' : 'lobby.deal');
  $('#wait-note').textContent = host
    ? (connected < 2 ? t('lobby.need2') : '')
    : (lobby.inGame ? t('lobby.inGame') : t('lobby.waitHost', { host: memberName(lobby.host) }));
}


function renderRulesForm() {
  const s = lobby.settings, host = isHost();
  const dis = host ? '' : 'disabled';
  const labels = (prefix, vals) => Object.fromEntries(vals.map(v => [v, t(`${prefix}.${v}`)]));
  const TIMER_LABELS = labels('pace', ['0', '6', '2.5']), DECK_LABELS = labels('decks', ['1', '2', '3']);
  const seg = (key, labels) => `<div class="seg" role="group">${Object.entries(labels).map(([v, [a, b]]) =>
    `<button type="button" ${dis} data-set="${key}" data-val="${v}" aria-pressed="${String(s[key]) === v}">${a}<small>${b}</small></button>`).join('')}</div>`;
  const sw = (key, label) => `<button type="button" class="switch" role="switch" ${dis} data-toggle="${key}" aria-checked="${!!s[key]}" aria-label="${label}"></button>`;
  $('#rules-form').innerHTML = `
    <div class="opt"><div class="opt-head"><strong>${t('opt.slap')}</strong>${sw('slap', t('opt.slap'))}</div>
      <p>${t('opt.slapDesc')}</p></div>
    <div class="opt"><div class="opt-head"><strong>${t('opt.pace')}</strong></div>
      ${seg('timer', TIMER_LABELS)}
      <p>${t('opt.paceDesc')}</p></div>
    <div class="opt"><div class="opt-head"><strong>${t('opt.decks')}</strong></div>
      ${seg('decks', DECK_LABELS)}
      <p>${t('opt.decksDesc')}</p></div>
    <div class="opt"><div class="opt-head"><strong>${t('opt.pen')}</strong>${sw('penitence', t('opt.penShort'))}</div>
      <p>${t('opt.penDesc')}</p></div>`;
}

$('#rules-form').addEventListener('click', e => {
  if (!isHost()) return;
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.toggle) session.send({ t: 'settings', settings: { [b.dataset.toggle]: !lobby.settings[b.dataset.toggle] } });
  if (b.dataset.set) session.send({ t: 'settings', settings: { [b.dataset.set]: Number(b.dataset.val) } });
});
$('#lobby-players').addEventListener('click', e => {
  const k = e.target.closest('[data-kick]');
  if (k && isHost()) session.send({ t: 'kick', cid: k.dataset.kick });
});
$('#btn-start').addEventListener('click', () => { unlock(); session?.send({ t: 'start' }); });
$('#btn-lobby-leave').addEventListener('click', () => confirmLeave());
$('#btn-share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}?stanza=${session.code}`;
  const text = t('share.text', { code: session.code });
  if (navigator.share) {
    try { await navigator.share({ title: 'Straccia Camicia', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(`${text}: ${url}`); toast(t('share.copied')); }
  catch { toast(url, 6000); }
});

// ---------------------------------------------------------------------------
// TAVOLO
// ---------------------------------------------------------------------------
function playerName(i) { return game?.view.players[i]?.name ?? '?'; }
function seatEl(i) { return i === myIndex ? $('#my-deck') : $(`.seat[data-i="${i}"] .avatar`); }

function onState(m) {
  const prev = game;
  game = m;
  myIndex = m.seats.indexOf(myCid);
  const v = m.view;
  const key = `${v.round}:${v.pile.length}`;
  if (!(key in seenAt)) seenAt[key] = performance.now();

  if (current() !== 'game') { show('game'); }
  const isNewGame = m.events.some(e => e.type === 'deal');
  if (isNewGame) { $('#overlay-end').hidden = true; clearTimeout(endTimer); seenAt = { [key]: performance.now() }; }

  // La presa: le carte vanno verso chi prende (prima di ridisegnare il mazzetto).
  const col = m.events.find(e => e.type === 'collect');
  if (col && prev) flyPileTo(col.p);

  renderGame();

  const playEv = [...m.events].reverse().find(e => e.type === 'play');
  if (playEv && v.pile.length && v.pile.at(-1).id === playEv.card.id) animateTop(playEv.p);
  if (isNewGame) animateDeal();

  for (const e of m.events) {
    if (e.type === 'play') sfx(payValue(e.card) ? 'pay' : 'card');
    if (e.type === 'collect' && e.reason !== 'final') { sfx('collect'); setFlash(collectText(e), 1500); }
    if (e.type === 'slap') {
      const me = e.p === myIndex;
      const name = esc(playerName(e.p));
      const faster = e.beaten?.length ? t('f.faster', { names: e.beaten.map(i => i === myIndex ? t('you.obj') : esc(playerName(i))).join(t('and')) }) : '';
      if (e.ok) { sfx('slap'); stamp(); setFlash(t(me ? 'f.slapMe' : 'f.slap', { name, faster }), 1700); }
      else { sfx('wrong'); setFlash(t((me ? 'f.wrongMe' : 'f.wrong') + (e.paid ? 'Paid' : ''), { name }), 1500); }
    }
    if (e.type === 'out') { sfx('out'); toast(e.p === myIndex ? t('out.me') : t('out.other', { name: playerName(e.p) })); }
    if (e.type === 'broke') setFlash(t('f.brokeEv', { name: esc(playerName(e.p)) }), 1500);
  }

  const myTurnNow = v.phase === 'playing' && v.turn === myIndex;
  const myTurnBefore = prev && prev.view.phase === 'playing' && prev.view.turn === myIndex;
  if (myTurnNow && !myTurnBefore && !isNewGame) sfx('turn');

  // Fine della partita: lascio vedere l'ultima presa, poi il resoconto.
  if (v.phase === 'over' && (!prev || prev.view.phase !== 'over')) {
    const won = v.winner === myIndex;
    clearTimeout(endTimer);
    endTimer = setTimeout(() => { sfx(v.draw ? 'out' : won ? 'win' : myIndex >= 0 ? 'lose' : 'pop'); renderEnd(); $('#overlay-end').hidden = false; }, 1400);
  }

  // Quando finisce la pausa dopo una presa, riaccendo il mio mazzo.
  clearTimeout(lockTimer);
  if (m.lockMs > 0) lockTimer = setTimeout(renderMe, m.lockMs + 30);
  m.receivedAt = performance.now();
}

function collectText(e) {
  const me = e.p === myIndex, vars = { name: esc(playerName(e.p)), n: nCards(e.n) };
  if (e.reason === 'broke') return t(me ? 'f.brokeMe' : 'f.broke', vars);
  if (e.reason === 'slap') return '';
  return `<strong>${t(me ? 'f.collectMe' : 'f.collect', vars)}</strong>`;
}

function setFlash(html, ms) {
  if (!html) return;
  flash = html;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flash = null; renderStatus(); }, ms);
  renderStatus();
}

function renderGame() {
  if (!game) return;
  const v = game.view, s = game.settings;
  $('#game-code').textContent = session?.practice ? t('practice.code') : (session?.code || '');
  const bits = [];
  if (s.slap) bits.push(t('v.slap'));
  if (s.timer === 2.5) bits.push(t('v.fast')); else if (s.timer) bits.push(t('v.normal'));
  bits.push(t('v.cards', { n: 40 * s.decks }));
  $('#game-variant').textContent = bits.join(', ');
  renderSeats();
  renderPile();
  renderStatus();
  renderMe();
}

function renderSeats() {
  const v = game.view, arc = $('#arc');
  const n = v.players.length;
  const order = [];
  const start = myIndex >= 0 ? myIndex : n - 1;
  for (let k = 1; k <= n; k++) { const i = (start + k) % n; if (i !== myIndex) order.push(i); }
  const existing = new Map([...arc.children].map(el => [Number(el.dataset.i), el]));
  arc.querySelectorAll('.seat').forEach(el => { if (!order.includes(Number(el.dataset.i))) el.remove(); });
  order.forEach((i, k) => {
    const p = v.players[i];
    let el = existing.get(i);
    if (!el) {
      el = document.createElement('div');
      el.className = 'seat'; el.dataset.i = i;
      arc.appendChild(el);
    }
    el.dataset.k = k; el.dataset.of = order.length;
    const off = !game.connected[i];
    const ob = v.obligation;
    let badge = '';
    if (v.phase === 'playing') {
      if (ob && v.turn === i) badge = `<span class="badge">${t('seat.pays', { n: ob.remaining })}</span>`;
      else if (ob && ob.owner === i) badge = `<span class="badge owner">${t('seat.owner')}</span>`;
      else if (off && !p.out) badge = `<span class="badge off">${t('seat.auto')}</span>`;
    }
    el.classList.toggle('turn', v.phase === 'playing' && v.turn === i);
    el.classList.toggle('out', p.out && v.winner !== i);
    el.classList.toggle('off', off);
    el.style.setProperty('--h', hueOf(p.name));
    el.innerHTML = `
      <span class="avatar" style="--h:${hueOf(p.name)}">${esc(initial(p.name))}${badge}</span>
      <span class="sname">${esc(p.name)}</span>
      <span class="scount">${p.out && v.winner !== i ? t('seat.out') : `<span class="mini-back"></span>${p.count}`}${v.dealer === i ? ` <span class="dealer">${t('seat.dealer')}</span>` : ''}</span>`;
    el.setAttribute('aria-label', t('seat.aria', { name: p.name, n: p.count }) + (v.turn === i ? t('seat.ariaTurn') : ''));
  });
  layoutSeats();
}

// Gli avversari si siedono ad arco, in ordine di gioco da sinistra a destra.
function layoutSeats() {
  const arc = $('#arc'); if (!arc) return;
  const w = arc.clientWidth, h = arc.clientHeight;
  const seats = [...arc.querySelectorAll('.seat')];
  const narrow = w < 520;
  seats.forEach(el => {
    const k = Number(el.dataset.k), n = Number(el.dataset.of);
    const t = (k + 1) / (n + 1);
    const ang = Math.PI * (1 - t);
    const rx = w * (narrow ? 0.4 : 0.42), ry = h * (n <= 2 ? 0.34 : 0.5);
    const x = w / 2 + Math.cos(ang) * rx;
    const y = h * (n <= 2 ? 0.5 : 0.82) - Math.sin(ang) * ry;
    el.style.left = `${x}px`; el.style.top = `${Math.max(48, y)}px`;
  });
}
window.addEventListener('resize', layoutSeats);

function cardTransform(card) {
  const h = hash(card.id);
  return { rot: (h % 23) - 11, dx: ((h >> 5) % 11) - 5, dy: ((h >> 9) % 9) - 4 };
}

function renderPile() {
  const v = game.view, pile = $('#pile');
  const shown = v.pile.slice(-7);
  const keep = new Map([...pile.querySelectorAll('.card')].map(el => [el.dataset.id, el]));
  pile.innerHTML = '';
  if (!v.pile.length) {
    pile.innerHTML = `<div class="pile-empty">${v.under ? t('pile.under', { n: v.under }) : ''}</div>`;
  }
  shown.forEach((c, idx) => {
    let el = keep.get(c.id);
    const look = prefs.style + getLang();
    if (!el || el.dataset.look !== look) { el = cardEl(c); el.dataset.look = look; }
    const t = cardTransform(c);
    el.style.transform = `translate(${t.dx}px, ${t.dy}px) rotate(${t.rot}deg)`;
    el.style.zIndex = idx;
    el.classList.toggle('pays', idx === shown.length - 1 && !!payValue(c) && !!v.obligation);
    el.classList.remove('fly');
    pile.appendChild(el);
  });
  const total = v.pile.length + v.under;
  $('#pile-count').innerHTML = total ? `<b>${total}</b>${total === 1 ? t('card') : t('cards')}` : '';
}

function rectCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function animateTop(from) {
  const top = $('#pile').lastElementChild;
  const src = seatEl(from);
  if (!top || !src || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = rectCenter(src), b = rectCenter(top);
  const final = top.style.transform;
  top.style.transition = 'none';
  top.style.transform = `translate(${a.x - b.x}px, ${a.y - b.y}px) scale(.55) rotate(${from === myIndex ? 0 : 25}deg)`;
  top.getBoundingClientRect();
  top.style.transition = '';
  top.classList.add('fly');
  top.style.transform = final;
}

function flyPileTo(p) {
  const pile = $('#pile');
  const target = seatEl(p);
  if (!target || !pile.children.length || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const b = rectCenter(target);
  [...pile.querySelectorAll('.card')].slice(-4).forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const f = el.cloneNode(true);
    f.className = 'card flyer';
    Object.assign(f.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, transform: el.style.transform, zIndex: 35 + i });
    document.body.appendChild(f);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      f.style.transitionDelay = `${i * 40}ms`;
      f.style.transform = `translate(${b.x - r.left - r.width / 2}px, ${b.y - r.top - r.height / 2}px) scale(.3) rotate(${i * 20}deg)`;
      f.style.opacity = '0.2';
    }));
    setTimeout(() => f.remove(), 700);
  });
}

function animateDeal() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const v = game.view, pile = $('#pile');
  const a = pile.getBoundingClientRect();
  const n = v.players.length;
  const total = Math.min(14, n * 3);
  for (let k = 0; k < total; k++) {
    const i = (v.dealer + 1 + k) % n;
    const target = seatEl(i); if (!target) continue;
    const b = rectCenter(target);
    const f = cardEl({}, { back: true });
    f.classList.add('flyer');
    Object.assign(f.style, { left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, opacity: 0 });
    document.body.appendChild(f);
    setTimeout(() => {
      f.style.opacity = 1;
      f.style.transform = `translate(${b.x - a.left - a.width / 2}px, ${b.y - a.top - a.height / 2}px) scale(.35) rotate(${k * 37 % 50 - 25}deg)`;
      sfx('card');
    }, 80 + k * 85);
    setTimeout(() => f.remove(), 600 + k * 85);
  }
}

function stamp() {
  const el = document.createElement('div');
  el.className = 'stamp';
  el.innerHTML = $('#btn-slap svg').outerHTML;
  $('.pile-wrap').appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function renderStatus() {
  if (!game) return;
  const v = game.view, st = $('#status');
  if (flash) { st.innerHTML = flash; return; }
  if (v.phase !== 'playing') { st.innerHTML = v.draw ? t('st.draw') : t('st.won', { name: esc(playerName(v.winner)) }); return; }
  const ob = v.obligation;
  const name = i => i === myIndex ? t('you.obj') : esc(playerName(i));
  let html;
  if (ob) {
    const dots = `<span class="debt">${Array.from({ length: ob.count }, (_, k) => `<i class="${k < ob.count - ob.remaining ? 'done' : ''}"></i>`).join('')}</span>`;
    html = v.turn === myIndex
      ? `${t('st.payMe', { n: nCards(ob.remaining), owner: name(ob.owner) })} ${dots}`
      : `${t('st.pays', { name: esc(playerName(v.turn)), owner: name(ob.owner) })} ${dots}`;
  } else {
    html = v.turn === myIndex ? t('st.yourTurn') : t('st.turn', { name: esc(playerName(v.turn)) });
  }
  let sub = '';
  if (myIndex < 0) sub = t('st.watching');
  else if (v.plays === 0) sub = v.dealer === myIndex ? t('st.dealtMe') : t('st.dealtBy', { name: esc(playerName(v.dealer)) });
  else if (ob && v.turn === myIndex) sub = t('st.payHint');
  st.innerHTML = html + (sub ? `<span class="sub">${sub}</span>` : '');
}

function lockedNow() {
  return game && game.lockMs && performance.now() - (game.receivedAt || 0) < game.lockMs;
}

function renderMe() {
  if (!game) return;
  const v = game.view, s = game.settings;
  const me = v.players[myIndex];
  const deck = $('#my-deck'), stack = $('#my-stack');
  const spectator = myIndex < 0;
  deck.hidden = spectator;
  $('#btn-slap').style.visibility = s.slap && !spectator && !me?.out ? 'visible' : 'hidden';
  if (!spectator) {
    const count = me.count;
    const want = Math.min(4, Math.ceil(count / 6));
    if (stack.children.length !== want) {
      stack.innerHTML = '';
      for (let k = 0; k < want; k++) {
        const c = cardEl({}, { back: true });
        c.style.transform = `translate(${k * 1.5}px, ${-k * 2.5}px)`;
        stack.appendChild(c);
      }
    }
    const ready = v.phase === 'playing' && v.turn === myIndex && !lockedNow();
    deck.classList.toggle('ready', ready);
    deck.classList.toggle('empty', count === 0);
    deck.setAttribute('aria-label', t(ready ? 'me.playAria' : 'me.deckAria'));
  }
  // Timer del turno (ritmo veloce o giocatore disconnesso)
  const timer = $('#my-timer'), bar = timer.firstElementChild;
  const mine = !spectator && v.phase === 'playing' && v.turn === myIndex && game.deadlineMs > 0;
  timer.classList.toggle('on', mine);
  bar.getAnimations?.().forEach(a => a.cancel());
  if (mine && bar.animate) {
    const left = game.deadlineMs - (performance.now() - (game.receivedAt || performance.now()));
    bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: Math.max(0, left), fill: 'forwards' });
  }

  let info = '';
  if (spectator) info = t('me.watching');
  else if (me.out && v.winner !== myIndex) info = t('me.out');
  else if (me.count === 0 && v.phase === 'playing') info = t('me.empty');
  else info = `<b>${me.count}</b> ${me.count === 1 ? t('card') : t('cards')}${v.dealer === myIndex ? ` <span class="dealer">${t('me.dealt')}</span>` : ''}`;
  $('#me-info').innerHTML = info;
}

// ---------------------------------------------------------------------------
// Azioni al tavolo
// ---------------------------------------------------------------------------
function doPlay() {
  if (!game || !session) return;
  unlock();
  const v = game.view;
  if (myIndex < 0 || v.phase !== 'playing') return;
  if (v.turn !== myIndex) {
    $('#my-deck').animate?.([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 180 });
    const info = $('#me-info');
    info.innerHTML = `<span class="nudge">${t(v.obligation ? 'me.paying' : 'me.wait', { name: esc(playerName(v.turn)) })}</span>`;
    clearTimeout(doPlay.t); doPlay.t = setTimeout(renderMe, 1300);
    return;
  }
  if (lockedNow()) return;
  session.send({ t: 'play' });
}

function doSlap() {
  if (!game || !session) return;
  unlock();
  const v = game.view;
  if (!v.rules.slap || myIndex < 0 || v.phase !== 'playing' || v.players[myIndex].out) return;
  const key = `${v.round}:${v.pile.length}`;
  const rt = performance.now() - (seenAt[key] ?? performance.now());
  session.send({ t: 'slap', round: v.round, len: v.pile.length, rt });
  const b = $('#btn-slap'); b.classList.remove('hot'); void b.offsetWidth; b.classList.add('hot');
}

$('#my-deck').addEventListener('click', doPlay);
$('#btn-slap').addEventListener('pointerdown', e => { e.preventDefault(); doSlap(); });
$('#btn-slap').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doSlap(); } });
document.addEventListener('keydown', e => {
  if (current() !== 'game' || !$('#sheet').hidden || e.repeat) return;
  if (e.target.closest('input')) return;
  if ((e.key === ' ' || e.key === 'Enter') && !e.target.closest('button')) { e.preventDefault(); doPlay(); }
  if (e.key === 'b' || e.key === 'B' || e.key === 'x' || e.key === 'X') doSlap();
});

// Nuvolette degli sfottò, vicino a chi le manda.
function showBubble(cid, text) {
  if (text.startsWith('p:')) text = t('phrase.' + text.slice(2));
  if (!game && current() !== 'game') { if (lobby) toast(`${memberName(cid)}: ${text}`, 1800); return; }
  const i = game?.seats.indexOf(cid) ?? -1;
  const el = i >= 0 ? seatEl(i) : null;
  const box = $('#bubbles').getBoundingClientRect();
  let x = box.width / 2, y = box.height / 2;
  if (el) { const r = el.getBoundingClientRect(); x = r.left + r.width / 2 - box.left; y = r.top - box.top + (i === myIndex ? 10 : 4); }
  const b = document.createElement('div');
  const isEmoji = /^\p{Extended_Pictographic}/u.test(text) && text.length <= 4;
  b.className = 'bubble' + (isEmoji ? ' emoji' : '');
  b.textContent = text;
  b.style.left = `${Math.min(box.width - 70, Math.max(70, x))}px`;
  b.style.top = `${Math.max(46, y)}px`;
  $('#bubbles').appendChild(b);
  sfx('pop');
  setTimeout(() => b.remove(), 2500);
}

// ---------------------------------------------------------------------------
// Fine partita
// ---------------------------------------------------------------------------
function renderEnd() {
  if (!game) return;
  const v = game.view, s = game.settings;
  const won = v.winner === myIndex;
  const winner = v.winner != null ? playerName(v.winner) : '';
  let art = '', title = '', sub = '';
  if (v.draw) {
    art = `<div class="trophy" style="position:relative;height:150px">${[0, 1, 2].map(k => `<div class="card" style="transform:translateX(-50%) rotate(${k * 120}deg)">${backSVG()}</div>`).join('')}</div>`;
    title = t('end.drawT');
    sub = t('end.drawS');
  } else if (won) {
    art = `<div class="trophy" style="position:relative;height:160px">${[{ s: 'D', r: 1 }, { s: 'C', r: 2 }, { s: 'S', r: 3 }].map((c, k) =>
      `<div class="card" style="transform:translateX(-50%) rotate(${(k - 1) * 16}deg) translateY(${k === 1 ? -8 : 0}px)">${card(c)}</div>`).join('')}</div>`;
    title = t('end.winT');
    sub = t('end.winS');
  } else if (myIndex >= 0 && s.penitence) {
    art = `<div class="shirt"><div class="half l">${backSVG()}</div><div class="half r">${backSVG()}</div><div class="shirt-msg">🫣</div></div>`;
    title = t('end.penT');
    sub = t('end.penS', { name: esc(winner) });
  } else {
    art = `<span class="avatar" style="--h:${hueOf(winner)};width:110px;height:110px;font-size:3rem">${esc(initial(winner))}</span>`;
    title = t('end.winsT', { name: esc(winner) });
    sub = t(myIndex >= 0 ? 'end.loseS' : 'end.watchS');
  }
  $('#end-art').innerHTML = art;
  $('#end-title').innerHTML = title;
  $('#end-sub').innerHTML = sub;
  const members = [...(lobby?.members || [])].sort((a, b) => b.wins - a.wins);
  $('#end-scores').innerHTML = members.map(p => `
    <li class="${p.cid === myCid ? 'me' : ''}"><span class="avatar" style="--h:${hueOf(p.name)}">${esc(initial(p.name))}</span>
    <span class="n">${esc(p.name)}</span><span class="w">${p.wins}</span></li>`).join('');
  $('#end-actions').innerHTML = isHost()
    ? `<button class="btn primary big" type="button" data-act="rematch">${t('end.rematch')}</button>
       <button class="btn link" type="button" data-act="lobby">${t('end.toLobby')}</button>`
    : `<p class="wait-note">${t('end.waitRematch', { host: esc(memberName(lobby?.host)) })}</p>
       <button class="btn link" type="button" data-act="leave">${t('end.leave')}</button>`;
}
$('#end-actions').addEventListener('click', e => {
  const a = e.target.closest('[data-act]')?.dataset.act;
  if (a === 'rematch') session?.send({ t: 'start' });
  if (a === 'lobby') session?.send({ t: 'toLobby' });
  if (a === 'leave') confirmLeave();
});

// ---------------------------------------------------------------------------
// Fogli: menu, regole, sfottò
// ---------------------------------------------------------------------------
function openSheet(html) {
  $('#sheet').innerHTML = html;
  $('#sheet').hidden = false; $('#sheet-backdrop').hidden = false;
  $('#sheet').querySelector('button, input')?.focus({ preventScroll: true });
}
function closeSheet() { $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true; }
$('#sheet-backdrop').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

function menuHTML() {
  const duo = st => `<span class="duo"><span class="card">${card({ s: 'C', r: 1 }, st)}</span><span class="card">${card({ s: 'D', r: 10 }, st)}</span></span>`;
  return `<h2>${t('menu.title')}</h2>
    <h3>${t('menu.lang')}</h3>
    <div class="seg lang-pick" role="group" aria-label="${t('menu.lang')}">${Object.keys(LANGS).map(l =>
      `<button type="button" data-lang="${l}" lang="${l}" aria-pressed="${getLang() === l}">${LANGS[l]['lang.name']}</button>`).join('')}</div>
    <h3>${t('menu.style')}</h3>
    <div class="style-pick">${Object.keys(STYLES).map(k =>
      `<button type="button" data-style="${k}" aria-pressed="${prefs.style === k}">${duo(k)}${t('style.' + k)}</button>`).join('')}</div>
    <p style="font-size:.88rem;color:var(--muted)">${t('menu.styleNote')}</p>
    <div class="toggle-row"><span>${t('menu.sound')}</span><button type="button" class="switch" role="switch" data-pref="sound" aria-checked="${prefs.sound}" aria-label="${t('menu.sound')}"></button></div>
    <div class="toggle-row"><span>${t('menu.vibrate')}</span><button type="button" class="switch" role="switch" data-pref="vibrate" aria-checked="${prefs.vibrate}" aria-label="${t('menu.vibrate')}"></button></div>
    <div class="close-row" style="justify-content:space-between">
      <button class="btn link" type="button" data-open="rules">${t('home.how')}</button>
      ${session ? `<button class="btn link danger" type="button" data-act="leave">${t(session.isHost && !session.practice ? 'menu.close' : 'menu.leave')}</button>` : ''}
    </div>`;
}

function rulesHTML() {
  const fig = (c, txt) => `<figure><span class="card">${card(c)}</span>${txt}</figure>`;
  return `<h2>${t('rules.title')}</h2>
    <p>${t('rules.intro')}</p>
    <ol>${t('rules.steps').map(x => `<li>${x}</li>`).join('')}</ol>
    <div class="rule-cards">${[{ s: 'C', r: 1 }, { s: 'D', r: 2 }, { s: 'B', r: 3 }].map(c => fig(c, t('pay', { n: c.r }))).join('')}</div>
    <h3>${t('rules.variants')}</h3>
    <ul>${t('rules.variantList').map(x => `<li>${x}</li>`).join('')}</ul>
    <h3>${t('rules.controls')}</h3>
    <p>${t('rules.controlsText')}</p>
    <div class="close-row"><button class="btn primary" type="button" data-act="close">${t('rules.ok')}</button></div>`;
}

function emojiHTML() {
  const emojis = ['😂', '🔥', '😭', '😱', '🫠', '👋'];
  // Le frasi viaggiano come codici: ognuno le legge nella sua lingua.
  const phrases = ['pay', 'rip', 'shirt', 'luck', 'again', 'slap'];
  return `<h2>${t('emoji.title')}</h2>
    <div class="emoji-grid">${emojis.map(e => `<button type="button" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('')}</div>
    <div class="phrase-grid">${phrases.map(p => `<button type="button" data-emoji="p:${p}">${esc(t('phrase.' + p))}</button>`).join('')}</div>`;
}

document.addEventListener('click', e => {
  const open = e.target.closest('[data-open]')?.dataset.open;
  if (open === 'menu') openSheet(menuHTML());
  if (open === 'rules') openSheet(rulesHTML());
});
$('#btn-emoji').addEventListener('click', () => openSheet(emojiHTML()));
$('#sheet').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.emoji) { session?.send({ t: 'emoji', e: b.dataset.emoji }); closeSheet(); }
  if (b.dataset.style) {
    prefs.style = b.dataset.style; savePrefs();
    $('#sheet').innerHTML = menuHTML();
    renderHero(); if (game) { $('#pile').innerHTML = ''; renderPile(); }
  }
  if (b.dataset.lang) { changeLang(b.dataset.lang); $('#sheet').innerHTML = menuHTML(); }
  if (b.dataset.pref) {
    prefs[b.dataset.pref] = !prefs[b.dataset.pref]; savePrefs();
    setSound(prefs.sound); setVibrate(prefs.vibrate);
setLang(detectLang(prefs.lang));
const card = (c, style = prefs.style) => cardSVG(c, style, n => t('pay', { n }));
    b.setAttribute('aria-checked', prefs[b.dataset.pref]);
    if (b.dataset.pref === 'sound' && prefs.sound) { unlock(); sfx('pop'); }
  }
  if (b.dataset.act === 'close') closeSheet();
  if (b.dataset.act === 'leave') { closeSheet(); confirmLeave(); }
});

function confirmLeave() {
  if (!session) return show('home');
  const hostInGame = session.isHost && !session.practice && lobby && lobby.members.length > 1;
  openSheet(`<h2>${t(hostInGame ? 'leave.titleHost' : 'leave.title')}</h2>
    <p>${t(hostInGame ? 'leave.textHost' : 'leave.text')}</p>
    <div class="end-actions"><button class="btn primary" type="button" id="btn-really-leave">${t(hostInGame ? 'leave.btnHost' : 'leave.btn')}</button>
    <button class="btn link" type="button" data-act="close">${t('leave.stay')}</button></div>`);
  $('#btn-really-leave').addEventListener('click', () => { closeSheet(); leave(); });
}

// ---------------------------------------------------------------------------
// Schermo sempre acceso durante la partita
// ---------------------------------------------------------------------------
async function requestWakeLock() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {}
}
function releaseWakeLock() { try { wakeLock?.release(); } catch {} wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && current() === 'game') requestWakeLock(); });
window.addEventListener('beforeunload', e => {
  if (session?.isHost && !session.practice && lobby?.members.length > 1) { e.preventDefault(); e.returnValue = ''; }
});
window.addEventListener('pagehide', () => { try { session?.close(); } catch {} });

// ---------------------------------------------------------------------------
// Lingua: cambia subito tutto ciò che è a schermo
// ---------------------------------------------------------------------------
function changeLang(l) {
  setLang(l); prefs.lang = l; savePrefs();
  applyStatic();
  document.querySelectorAll('.lang-switch [data-lang]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === l));
  renderHero();
  if (lobby) renderLobby();
  if (game) { $('#pile').innerHTML = ''; renderGame(); if (!$('#overlay-end').hidden) renderEnd(); }
  const err = $('#home-error'); if (err.dataset.key) err.textContent = t(err.dataset.key);
}

// ---------------------------------------------------------------------------
// Avvio
// ---------------------------------------------------------------------------
function init() {
  installSprite();
  applyStatic();
  document.querySelectorAll('.lang-switch [data-lang]').forEach(b => {
    b.setAttribute('aria-pressed', b.dataset.lang === getLang());
    b.addEventListener('click', () => changeLang(b.dataset.lang));
  });
  renderHero();
  $('#in-name').value = prefs.name || '';
  const params = new URLSearchParams(location.search);
  const code = normalizeCode(params.get('stanza'));

  const openJoin = on => {
    $('#join-box').hidden = !on; $('#home-actions').hidden = on; homeError('');
    if (on) $(prefs.name ? '#in-code' : '#in-name').focus();
  };
  $('#btn-create').addEventListener('click', doCreate);
  $('#btn-join').addEventListener('click', () => openJoin(true));
  $('#btn-join-cancel').addEventListener('click', () => { openJoin(false); history.replaceState(null, '', location.pathname); });
  $('#btn-join-go').addEventListener('click', () => doJoin($('#in-code').value));
  $('#btn-practice').addEventListener('click', doPractice);
  $('#in-code').addEventListener('input', e => { e.target.value = normalizeCode(e.target.value); });
  $('#form-name').addEventListener('submit', e => {
    e.preventDefault();
    if (!$('#join-box').hidden) doJoin($('#in-code').value); else doCreate();
  });

  show('home');
  if (code) {
    $('#in-code').value = code;
    openJoin(true);
    let rejoin = null; try { rejoin = sessionStorage.getItem('sc-joined'); } catch {}
    if (rejoin === code && prefs.name) doJoin(code); // pagina ricaricata: rientro da solo
  }
  if (params.has('prova') && prefs.name) doPractice();
}
init();
