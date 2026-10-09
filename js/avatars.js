// Avatar dei giocatori: iniziale del nome, disegni fatti apposta o emoji.
// In rete viaggia solo un codice ('', 'svg:moka', 'emoji:🐱'); ogni schermo lo
// disegna da sé. In futuro il codice potrà indicare anche un'immagine del profilo.

const INK = '#1F1A17';
const s = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
const c = (x, y, r, fill, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="1.8" ${extra}/>`;
const line = (d, w = 1.8, color = INK) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

// Ogni disegno: colore di sfondo e contenuto in un riquadro 48×48.
export const AVATAR_ART = {
  moka: {
    bg: '#3466B0',
    svg: line('M31 16c5.5 0 5.5 7.5-.8 7.5', 3, INK) +
      s('M18 11.5h12l1.5 2.5h-15z', '#C9CED4') + c(24, 9.6, 1.6, '#C9CED4') +
      s('M16.5 14h15l-2 9h-11z', '#E3E7EB') + s('M16.5 14l-3.2-1.6 1.8 4.4', '#E3E7EB') +
      s('M18.5 23h11v2.4h-11z', '#9EA5AD') +
      s('M18.5 25.4h11l3 11.6h-17z', '#E3E7EB') + line('M21 28v6.5M24 28v6.5M27 28v6.5', 1.2, '#9EA5AD'),
  },
  pizza: {
    bg: '#2F7D4F',
    svg: s('M24 39L12.5 15.5Q24 9.5 35.5 15.5z', '#F4C95A') +
      line('M12.5 15.5Q24 9.5 35.5 15.5', 4.2, '#C7853A') + line('M12.5 15.5Q24 9.5 35.5 15.5', 1.8) +
      c(21, 19.5, 2.7, '#C8372D') + c(27.5, 22.5, 2.5, '#C8372D') + c(23.5, 29, 2.2, '#C8372D') +
      '<path d="M28.5 15.5q2.5-1.5 3.6 1-2.6 1.4-3.6-1z" fill="#3E8E5A"/>',
  },
  gatto: {
    bg: '#4C5C8A',
    svg: s('M13 21L14.5 9.5l6.5 5.6q3-.9 6 0l6.5-5.6L35 21q1.6 13.5-11 14Q11.4 34.5 13 21z', '#F0A040') +
      '<path d="M16 12.5l.9 5.5 3-2.6zM32 12.5l-.9 5.5-3-2.6z" fill="#F7C9A8"/>' +
      `<ellipse cx="19.8" cy="22.5" rx="1.7" ry="2.6" fill="${INK}"/><ellipse cx="28.2" cy="22.5" rx="1.7" ry="2.6" fill="${INK}"/>` +
      s('M22.4 27h3.2L24 28.8z', '#E5788A', 'stroke-width="1.2"') +
      line('M24 28.8v1.6m0 0q-1.6 1.6-3.2.4m3.2-.4q1.6 1.6 3.2.4', 1.3) +
      line('M8.5 25.5l7.5 1.2M8.5 30l7.5-1.4M39.5 25.5l-7.5 1.2M39.5 30l-7.5-1.4', 1.2, '#FFF6EC'),
  },
  limone: {
    bg: '#1F6E78',
    svg: line('M26 17.5q.6-3 2.5-4.5', 2) +
      s('M28.5 13q5.5-4.6 10.5-1.5-4.4 5.6-10.5 1.5z', '#5DA85F') +
      `<g transform="rotate(-28 24 27)">${s('M11 27q0-2.6 2.2-3.2Q16 17.8 24 17.8t10.8 6q2.2.6 2.2 3.2t-2.2 3.2q-2.8 6-10.8 6t-10.8-6Q11 29.6 11 27z', '#F7D73A')}` +
      '<ellipse cx="20" cy="23.5" rx="4" ry="1.6" fill="#FFF3A6"/></g>',
  },
  corona: {
    bg: '#8E2F3A',
    svg: s('M11.5 34V16.5l7 7.5L24 12l5.5 12 7-7.5V34z', '#E8B634') +
      s('M11.5 29.5h25V34h-25z', '#B98712') +
      c(11.5, 15.5, 2, '#E8B634') + c(24, 11, 2, '#E8B634') + c(36.5, 15.5, 2, '#E8B634') +
      c(18, 31.8, 1.5, '#C8372D', 'stroke-width="1.2"') + c(24, 31.8, 1.5, '#3466B0', 'stroke-width="1.2"') + c(30, 31.8, 1.5, '#C8372D', 'stroke-width="1.2"'),
  },
  corno: {
    bg: '#EDE4D3',
    svg: s('M26.5 14.5Q27 28 13.5 38.5Q33.5 32 35.5 14.5z', '#D3322B') +
      '<path d="M29.5 17.5q.4 9-7 15.5" fill="none" stroke="#F07A6A" stroke-width="1.8" stroke-linecap="round"/>' +
      s('M25.5 11.5h11v4h-11z', '#E8B634') +
      `<circle cx="31" cy="8.2" r="2.4" fill="none" stroke="#B98712" stroke-width="2"/>`,
  },
  gelato: {
    bg: '#5FA9BD',
    svg: s('M17.5 24.5h13L24 41z', '#D9A35B') +
      line('M19.5 27.5l7.8 7M22.5 25.5l6 5.4M28.5 27.5l-7.8 7M25.5 25.5l-6 5.4', 1.1, '#9C6B2E') +
      c(24, 20, 7.2, '#F29BB0') + c(24, 13.2, 5.4, '#FFF1D2') + c(24, 7.2, 2.2, '#C8372D') +
      line('M24 5q1-2.2 3-2.6', 1.4),
  },
  vesuvio: {
    bg: '#E58E4E',
    svg: c(29, 6.5, 2.4, '#F2ECE3') + c(26.5, 10.5, 3, '#F2ECE3') + c(23.5, 15, 3.4, '#F2ECE3') +
      s('M5.5 37L18.5 19.5l3 2.2 2.5-1.6 2.5 1.6 3-2.2L42.5 37z', '#6B4A3A') +
      '<path d="M18.5 19.5l3 2.2 2.5-1.6 2.5 1.6 3-2.2-1.4 4.5-2.2-1-1.9 2.3-1.9-2.3-2.2 1z" fill="#E8B634"/>' +
      line('M5.5 37h37', 1.8) + '<path d="M5.5 38h37v5h-37z" fill="#3466B0"/>',
  },
  coppa: {
    bg: '#A3333A',
    svg: s('M14.5 12h19q0 14.5-9.5 15.2Q14.5 26.5 14.5 12z', '#E8B634') +
      line('M15.6 17h16.8', 1.4, '#B98712') +
      s('M22.4 27h3.2v6.2h-3.2z', '#E8B634') +
      s('M16.5 38q7.5-7.5 15 0z', '#E8B634') + c(24, 21, 1.6, '#C8372D', 'stroke-width="1.2"'),
  },
  denaro: {
    bg: '#2B4A7E',
    svg: c(24, 24, 13, '#E8B634') + c(24, 24, 9, '#F2C651') +
      '<g fill="#C8372D" stroke="#1F1A17" stroke-width="1.2">' +
      '<ellipse cx="24" cy="19.8" rx="2.2" ry="3.4"/><ellipse cx="24" cy="28.2" rx="2.2" ry="3.4"/>' +
      '<ellipse cx="19.8" cy="24" rx="3.4" ry="2.2"/><ellipse cx="28.2" cy="24" rx="3.4" ry="2.2"/></g>' +
      c(24, 24, 1.8, '#3E8E5A', 'stroke-width="1.2"'),
  },
  spada: {
    bg: '#4B4E57',
    svg: '<g transform="rotate(38 24 24)">' +
      s('M24 6.5l2.3 4v19.5h-4.6V10.5z', '#DDE3EA') + line('M24 11v18', 1, '#9EA5AD') +
      s('M16.5 30h15v3.2h-15z', '#E8B634') + s('M22.4 33.2h3.2v6h-3.2z', '#7A2A2F') + c(24, 41.2, 2.1, '#E8B634') + '</g>',
  },
  bastone: {
    bg: '#6E8B3D',
    svg: '<g transform="rotate(-32 24 24)">' +
      s('M21.6 41q-.8-14-1.8-23.5Q19.5 8.5 24 8.5t4.2 9q-1 9.5-1.8 23.5z', '#B5773A') +
      `<g fill="${INK}"><circle cx="22.6" cy="14.5" r="1"/><circle cx="25.6" cy="20" r="1"/><circle cx="22.8" cy="26" r="1"/><circle cx="25" cy="32.5" r="1"/></g>` +
      s('M27.6 22.5q5.2-3.6 8.4-.6-4.4 3.8-8.4.6z', '#5DA85F', 'stroke-width="1.4"') + '</g>',
  },
};
export const AVATAR_IDS = Object.keys(AVATAR_ART);

export const AVATAR_EMOJI = ['😎', '🤠', '🥸', '😈', '👻', '🤖', '🐱', '🐶', '🦊', '🐸', '🐼', '🦁', '🐙', '🦄', '🌶️', '🍀', '🎩', '🃏'];

const escHTML = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** Che cosa disegnare per un codice avatar (codici sconosciuti → iniziale). */
export function parseAvatar(a) {
  a = typeof a === 'string' ? a : '';
  if (a.startsWith('svg:') && AVATAR_ART[a.slice(4)]) return { kind: 'svg', id: a.slice(4) };
  if (a.startsWith('emoji:') && a.length > 6) return { kind: 'emoji', text: a.slice(6) };
  return { kind: 'initial' };
}

/**
 * HTML dell'avatar. `hue` colora lo sfondo dell'iniziale e delle emoji;
 * `inner` aggiunge contenuto (es. il cartellino "paga 2" sul tavolo).
 */
export function avatarHTML({ name = '', avatar = '', hue = 0, inner = '', cls = '', style = '' } = {}) {
  const p = parseAvatar(avatar);
  const base = `avatar ${cls}`.trim();
  if (p.kind === 'svg') {
    const art = AVATAR_ART[p.id];
    return `<span class="${base} art" style="--bg:${art.bg};${style}"><svg viewBox="0 0 48 48" aria-hidden="true">${art.svg}</svg>${inner}</span>`;
  }
  if (p.kind === 'emoji') {
    return `<span class="${base} emo" style="--h:${hue};${style}"><span class="emo-g" aria-hidden="true">${escHTML(p.text)}</span>${inner}</span>`;
  }
  const letter = (String(name).trim()[0] || '?').toUpperCase();
  return `<span class="${base}" style="--h:${hue};${style}">${escHTML(letter)}${inner}</span>`;
}
