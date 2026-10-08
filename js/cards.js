// Le carte del gioco.
// - Napoletane e piacentine: immagini di mazzi veri, da Wikimedia Commons
//   (pubblico dominio, vedi carte/CREDITI.md), con il loro dorso.
// - Moderne: disegnate qui in SVG, con indici grandi e l'etichetta "paga N".
// Il dorso "a camicia" disegnato in SVG resta per lo stile moderno e per la
// camicia stracciata di fine partita.

export const STYLES = {
  napoletano: { label: 'Napoletane' },
  piacentino: { label: 'Piacentine' },
  moderno: { label: 'Moderne' },
};

export const PHOTO_DECKS = { napoletano: 'carte/napoletane', piacentino: 'carte/piacentine' };
const BACK_IMG = 'carte/dorso.webp';
const SUITS = ['D', 'C', 'B', 'S'];

/** Faccia della carta come HTML: immagine vera o SVG disegnato. */
export function cardHTML(card, style = 'napoletano', payLabel) {
  const dir = PHOTO_DECKS[style];
  if (dir) return `<img src="${dir}/${card.s}${card.r}.webp" alt="" draggable="false" decoding="async">`;
  return cardSVG(card, style, payLabel);
}

/** Dorso della carta come HTML, nello stile scelto. */
export function backHTML(style = 'napoletano') {
  return PHOTO_DECKS[style] ? `<img src="${BACK_IMG}" alt="" draggable="false" decoding="async">` : backSVG();
}

/** Scarica in anticipo le 40 carte e il dorso, così durante la partita compaiono subito. */
const preloaded = new Set();
export function preloadDeck(style) {
  const dir = PHOTO_DECKS[style];
  if (!dir || preloaded.has(style)) return;
  preloaded.add(style);
  const srcs = [BACK_IMG];
  for (const s of SUITS) for (let r = 1; r <= 10; r++) srcs.push(`${dir}/${s}${r}.webp`);
  for (const src of srcs) { const im = new Image(); im.decoding = 'async'; im.src = src; }
}

const W = 180, H = 300;

// ---------------------------------------------------------------------------
// Semi (simboli riusabili). Ogni simbolo sta in un box di circa 70×80 centrato in 0,0.
// ---------------------------------------------------------------------------
const INK = '#2A2118';

const SYMBOLS = {
  // ---------- napoletano ----------
  'n-C': `<g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
      <path d="M-24 -30 Q-26 6 -6 12 L-4 20 Q-14 26 -18 33 L18 33 Q14 26 4 20 L6 12 Q26 6 24 -30 Z" fill="#E2A72E"/>
      <path d="M-22 -22 Q-20 2 0 7 Q20 2 22 -22" fill="none" stroke="#B3261E" stroke-width="4"/>
      <ellipse cx="0" cy="-30" rx="24" ry="6" fill="#B3261E"/>
      <ellipse cx="0" cy="16" rx="7" ry="3.5" fill="#B3261E"/>
    </g>`,
  'n-D': `<g stroke="${INK}" stroke-width="2.2">
      <circle r="31" fill="#E2A72E"/>
      <circle r="24" fill="#B3261E"/>
      <circle r="19" fill="#E2A72E"/>
      <g fill="#B3261E" stroke-width="1.5">${petals(8, 13, 4.2)}</g>
      <circle r="5" fill="#2E6B3A"/>
    </g>`,
  'n-B': `<g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
      <path d="M-9 -36 Q2 -40 10 -34 Q14 -18 8 0 L6 36 Q0 40 -5 36 L-6 0 Q-14 -18 -9 -36 Z" fill="#3E8A47"/>
      <path d="M-4 -26 l-8 -4 M6 -12 l9 -3 M-5 4 l-8 2 M5 18 l7 2" stroke="#3E8A47" stroke-width="5" stroke-linecap="round"/>
      <path d="M-4 -26 l-8 -4 M6 -12 l9 -3 M-5 4 l-8 2 M5 18 l7 2" stroke="${INK}" stroke-width="1" stroke-linecap="round" fill="none"/>
      <path d="M-6 30 L6 30" stroke="#B3261E" stroke-width="5"/>
    </g>`,
  'n-S': `<g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
      <path d="M-5 -16 L-5 30 L0 39 L5 30 L5 -16 Z" fill="#7FA6D6"/>
      <path d="M0 -14 L0 30" stroke="#3E5F94" stroke-width="1.6"/>
      <rect x="-20" y="-21" width="40" height="7" rx="3.5" fill="#E2A72E"/>
      <rect x="-4.5" y="-37" width="9" height="16" fill="#B3261E"/>
      <circle cy="-40" r="5.5" fill="#E2A72E"/>
    </g>`,
  // ---------- piacentino ----------
  'p-C': `<g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
      <path d="M-26 -26 L26 -26 L10 8 L4 10 L4 22 L16 32 L-16 32 L-4 22 L-4 10 L-10 8 Z" fill="#C9852B"/>
      <path d="M-20 -14 L20 -14" stroke="#8E2B22" stroke-width="5"/>
      <path d="M-26 -26 L26 -26" stroke="#8E2B22" stroke-width="5"/>
      <circle cy="15" r="4" fill="#8E2B22"/>
    </g>`,
  'p-D': `<g stroke="${INK}" stroke-width="2.2">
      <circle r="31" fill="#C9852B"/>
      <circle r="27" fill="none" stroke="#8E2B22" stroke-width="3" stroke-dasharray="4 3"/>
      <g fill="#8E2B22" stroke-width="1.5">${petals(4, 11, 7)}</g>
      <circle r="6" fill="#C9852B"/>
    </g>`,
  'p-B': `<g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
      <path d="M-5 -34 L5 -34 L5 34 L-5 34 Z" fill="#5E7F3A"/>
      <path d="M-5 -34 Q-16 -42 -10 -30 M5 -34 Q16 -42 10 -30" fill="#5E7F3A"/>
      <g fill="#C9852B" stroke-width="1.6"><circle cy="-18" r="4"/><circle cy="0" r="4"/><circle cy="18" r="4"/></g>
      <path d="M-8 34 L8 34" stroke="#8E2B22" stroke-width="5"/>
    </g>`,
  'p-S': `<g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round">
      <path d="M-3 -18 Q22 4 -2 40 Q8 8 -9 -18 Z" fill="#9DB3C8"/>
      <rect x="-18" y="-24" width="30" height="7" rx="3.5" fill="#C9852B"/>
      <path d="M-7 -24 L-1 -24 L1 -38 L-6 -38 Z" fill="#8E2B22"/>
      <circle cx="-2" cy="-41" r="5" fill="#C9852B"/>
    </g>`,
  // ---------- moderno ----------
  'm-C': `<g fill="#D7263D"><path d="M-26 -28 L26 -28 Q26 8 4 12 L4 24 L18 24 L18 32 L-18 32 L-18 24 L-4 24 L-4 12 Q-26 8 -26 -28 Z"/></g>`,
  'm-D': `<g><circle r="30" fill="#E0A100"/><circle r="17" fill="none" stroke="#fff" stroke-width="6"/></g>`,
  'm-B': `<g fill="#1E8A4C"><rect x="-9" y="-36" width="18" height="72" rx="9"/><rect x="-16" y="-10" width="32" height="8" rx="4"/></g>`,
  'm-S': `<g fill="#2457C5"><path d="M0 -40 L9 -18 L9 24 L-9 24 L-9 -18 Z"/><rect x="-20" y="22" width="40" height="8" rx="4"/><rect x="-5" y="30" width="10" height="10" rx="2"/></g>`,
};

function petals(n, dist, r) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    s += `<ellipse cx="${(Math.cos(a) * dist).toFixed(1)}" cy="${(Math.sin(a) * dist).toFixed(1)}" rx="${r}" ry="${(r * 0.62).toFixed(1)}" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} ${(Math.cos(a) * dist).toFixed(1)} ${(Math.sin(a) * dist).toFixed(1)})"/>`;
  }
  return s;
}

/** Inserisce una volta sola lo "sprite" con i simboli nel documento. */
export function installSprite(doc = document) {
  if (doc.getElementById('sc-sprite')) return;
  const div = doc.createElement('div');
  div.innerHTML = `<svg id="sc-sprite" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${
    Object.entries(SYMBOLS).map(([id, g]) => `<g id="${id}">${g}</g>`).join('')
  }${backPattern()}</defs></svg>`;
  doc.body.prepend(div.firstElementChild);
}

// ---------------------------------------------------------------------------
// Disposizione dei semi sulle carte numerali (1–7)
// ---------------------------------------------------------------------------
const PIPS = {
  2: [[90, 95], [90, 205]],
  3: [[90, 78], [90, 150], [90, 222]],
  4: [[56, 95], [124, 95], [56, 205], [124, 205]],
  5: [[56, 88], [124, 88], [90, 150], [56, 212], [124, 212]],
  6: [[56, 78], [124, 78], [56, 150], [124, 150], [56, 222], [124, 222]],
  7: [[56, 72], [124, 72], [90, 111], [56, 150], [124, 150], [56, 228], [124, 228]],
};

const SUIT_COLOR = {
  napoletano: { C: '#B3261E', D: '#A8740E', B: '#2E6B3A', S: '#2C4E86' },
  piacentino: { C: INK, D: INK, B: INK, S: INK },
  moderno: { C: '#D7263D', D: '#B88200', B: '#1E8A4C', S: '#2457C5' },
};

const PALETTE = {
  napoletano: { paper: '#FBF6E9', frame: '#2A2118', accent: '#B3261E', robe: { C: '#B3261E', D: '#E2A72E', B: '#3E8A47', S: '#3E66A8' } },
  piacentino: { paper: '#FFFCF4', frame: '#8E2B22', accent: '#8E2B22', robe: { C: '#8E2B22', D: '#C9852B', B: '#5E7F3A', S: '#4D6A88' } },
  moderno: { paper: '#FFFFFF', frame: '#E7E4DE', accent: '#111111', robe: { C: '#D7263D', D: '#E0A100', B: '#1E8A4C', S: '#2457C5' } },
};

function use(style, s, x, y, scale = 0.5, rot = 0) {
  const p = style[0];
  return `<use href="#${p}-${s}" transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})"/>`;
}

function indexText(style, card, x, y, anchor, rotate = false) {
  const color = SUIT_COLOR[style][card.s];
  const font = style === 'moderno'
    ? `font-family="Archivo, system-ui, sans-serif" font-weight="800" font-stretch="75%"`
    : `font-family="'Bodoni Moda', 'Didot', Georgia, serif" font-weight="700"`;
  const size = style === 'moderno' ? 50 : 44;
  const tr = rotate ? ` transform="rotate(180 ${x} ${y})"` : '';
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="hanging" font-size="${size}" fill="${color}" ${font}${tr}>${card.r}</text>`;
}

// ---------------------------------------------------------------------------
// Figure: Fante (8), Cavallo (9), Re (10)
// ---------------------------------------------------------------------------
function figure(style, card) {
  const pal = PALETTE[style];
  const robe = pal.robe[card.s];
  const skin = '#F1C9A2', hair = '#4A2E1C', dark = INK;
  const sw = style === 'moderno' ? 0 : 2.2;
  const st = sw ? `stroke="${dark}" stroke-width="${sw}" stroke-linejoin="round"` : '';
  const trim = style === 'moderno' ? '#111111' : (card.s === 'D' ? '#B3261E' : '#E2A72E');
  const sym = (x, y, sc) => use(style, card.s, x, y, sc);

  if (card.r === 8) { // Fante: giovane in piedi, berretto, regge il seme
    return `<g ${st}>
      <rect x="72" y="198" width="14" height="52" fill="${trim}"/>
      <rect x="94" y="198" width="14" height="52" fill="${trim}"/>
      <path d="M66 248 h24 v8 h-24z M90 248 h24 v8 h-24z" fill="${dark}"/>
      <path d="M62 118 L118 118 L126 206 L54 206 Z" fill="${robe}"/>
      <path d="M90 118 L90 206" stroke="${trim}" stroke-width="5"/>
      <rect x="58" y="160" width="64" height="9" fill="${trim}"/>
      <circle cx="90" cy="94" r="20" fill="${skin}"/>
      <path d="M70 90 Q70 66 90 66 Q114 66 112 84 Q124 82 126 74 Q122 96 110 92 Q102 72 70 90 Z" fill="${trim}"/>
      <path d="M71 96 Q68 112 78 112" fill="${hair}"/>
      <path d="M62 124 L44 178" stroke="${robe}" stroke-width="13" stroke-linecap="round"/>
      <path d="M118 124 L132 150" stroke="${robe}" stroke-width="13" stroke-linecap="round"/>
    </g>${sym(134, 152, 0.62)}`;
  }
  if (card.r === 9) { // Cavallo: cavaliere a cavallo
    return `<g ${st}>
      <path d="M40 210 L46 254 M62 214 L60 256 M118 214 L122 256 M138 208 L146 252" stroke="#7A5233" stroke-width="9" stroke-linecap="round"/>
      <path d="M32 170 Q34 148 64 148 L120 146 Q140 132 140 112 L132 92 Q148 86 160 104 L164 124 Q160 132 150 128 L148 148 Q150 176 138 206 L42 212 Q28 200 32 170 Z" fill="#B98552"/>
      <path d="M132 92 Q124 108 128 140" fill="none" stroke="${hair}" stroke-width="6"/>
      <path d="M32 170 Q16 178 20 206" fill="none" stroke="${hair}" stroke-width="7" stroke-linecap="round"/>
      <path d="M66 150 L104 150 L100 176 L70 176 Z" fill="${trim}"/>
      <path d="M72 150 L68 98 L104 98 L102 150 Z" fill="${robe}"/>
      <path d="M86 150 L84 194" stroke="${robe}" stroke-width="12" stroke-linecap="round"/>
      <circle cx="86" cy="78" r="17" fill="${skin}"/>
      <path d="M68 74 Q70 54 88 56 Q106 56 104 72 Z" fill="${trim}"/>
      <path d="M100 108 L124 84" stroke="${robe}" stroke-width="11" stroke-linecap="round"/>
    </g>${sym(128, 66, 0.55)}`;
  }
  // Re: corona, barba, mantello lungo
  return `<g ${st}>
    <path d="M58 120 Q90 108 122 120 L134 252 L46 252 Z" fill="${robe}"/>
    <path d="M90 116 L90 252" stroke="${trim}" stroke-width="7"/>
    <path d="M46 252 L134 252" stroke="${trim}" stroke-width="7"/>
    <path d="M58 124 Q90 140 122 124" fill="none" stroke="#F4EEE2" stroke-width="9"/>
    <circle cx="90" cy="92" r="21" fill="${skin}"/>
    <path d="M70 96 Q72 126 90 128 Q108 126 110 96 Q100 108 90 106 Q80 108 70 96 Z" fill="#E9E1D2"/>
    <path d="M68 74 L68 54 L78 64 L90 48 L102 64 L112 54 L112 74 Z" fill="#E2A72E"/>
    <circle cx="90" cy="60" r="3.5" fill="#B3261E"/>
    <path d="M60 132 L42 178" stroke="${robe}" stroke-width="14" stroke-linecap="round"/>
    <path d="M120 132 L136 166" stroke="${robe}" stroke-width="14" stroke-linecap="round"/>
    <path d="M46 182 L36 252" stroke="#E2A72E" stroke-width="5" stroke-linecap="round"/>
  </g>${sym(138, 168, 0.6)}`;
}

// ---------------------------------------------------------------------------
// Carta completa
// ---------------------------------------------------------------------------
const cache = new Map();

// payLabel: testo dell'etichetta "paga N" dello stile moderno, nella lingua di chi guarda.
export function cardSVG(card, style = 'napoletano', payLabel = n => `paga ${n}`) {
  const tagText = card.r <= 3 ? payLabel(card.r) : '';
  const key = style + card.s + card.r + tagText;
  if (cache.has(key)) return cache.get(key);
  const pal = PALETTE[style];
  let body = '';
  if (card.r === 1) {
    body = use(style, card.s, 90, 150, 1.25);
    if (style === 'napoletano') body = `<circle cx="90" cy="150" r="58" fill="none" stroke="${pal.accent}" stroke-width="1.5" stroke-dasharray="2 5"/>` + body;
  } else if (card.r <= 7) {
    const sc = card.r <= 3 ? 0.84 : card.r <= 6 ? 0.7 : 0.6;
    body = PIPS[card.r].map(([x, y]) => use(style, card.s, x, y, sc)).join('');
  } else {
    body = figure(style, card);
  }

  let frame = '';
  if (style === 'napoletano') {
    frame = `<rect x="7" y="7" width="${W - 14}" height="${H - 14}" rx="9" fill="none" stroke="${pal.frame}" stroke-width="1.6"/>
             <rect x="11" y="11" width="${W - 22}" height="${H - 22}" rx="6" fill="none" stroke="${pal.frame}" stroke-width="0.8"/>`;
  } else if (style === 'piacentino') {
    frame = `<rect x="8" y="8" width="${W - 16}" height="${H - 16}" rx="6" fill="none" stroke="${pal.frame}" stroke-width="4"/>`;
  }

  // Indici: in alto a sinistra e capovolto in basso a destra.
  let idx = indexText(style, card, 16, 14, 'start') + indexText(style, card, W - 16, H - 14, 'start', true);

  // Nello stile moderno le carte che fanno pagare lo dicono chiaramente.
  let tag = '';
  if (style === 'moderno' && card.r <= 3) {
    tag = `<g transform="translate(${W - 14} 16)"><rect x="-58" y="0" width="58" height="24" rx="12" fill="#111"/>
      <text x="-29" y="12.5" text-anchor="middle" dominant-baseline="central" font-family="Archivo, system-ui, sans-serif" font-weight="700" font-size="14" fill="#fff">${tagText}</text></g>`;
  }

  const svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img">
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="${pal.paper}" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/>
    ${frame}${body}${idx}${tag}</svg>`;
  cache.set(key, svg);
  return svg;
}

// ---------------------------------------------------------------------------
// Dorso: stoffa da camicia a righe, con colletto e bottoni.
// ---------------------------------------------------------------------------
function backPattern() {
  return `<pattern id="sc-stripes" width="14" height="14" patternUnits="userSpaceOnUse">
      <rect width="14" height="14" fill="#F3F6FB"/>
      <rect x="0" width="5" height="14" fill="#3466B0"/>
      <rect x="8" width="1.2" height="14" fill="#9DB7DE"/>
    </pattern>`;
}

export function backSVG() {
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" fill="#F7F4EE" stroke="rgba(0,0,0,.2)" stroke-width="1.5"/>
    <rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="9" fill="url(#sc-stripes)"/>
    <path d="M90 9 L54 9 L40 34 L72 62 L90 40 Z" fill="#FFFFFF" stroke="#1D3E73" stroke-width="2" stroke-linejoin="round"/>
    <path d="M90 9 L126 9 L140 34 L108 62 L90 40 Z" fill="#FFFFFF" stroke="#1D3E73" stroke-width="2" stroke-linejoin="round"/>
    <rect x="80" y="40" width="20" height="251" fill="#F3F6FB" stroke="#1D3E73" stroke-width="1.2" opacity=".96"/>
    ${[78, 128, 178, 228, 274].map(y => `<g transform="translate(90 ${y})"><circle r="6.5" fill="#FFFDF8" stroke="#1D3E73" stroke-width="1.6"/><circle cx="-2" cy="0" r="1.1" fill="#1D3E73"/><circle cx="2" cy="0" r="1.1" fill="#1D3E73"/></g>`).join('')}
    <path d="M124 150 h34 v36 q-17 8 -34 0 z" fill="none" stroke="#1D3E73" stroke-width="1.6" opacity=".8"/>
  </svg>`;
}
