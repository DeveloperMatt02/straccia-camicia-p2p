// Configurazione di rete. Il gioco usa PeerJS: il server pubblico gratuito di
// PeerJS serve solo a "presentare" i telefoni tra loro, poi le carte viaggiano
// direttamente da dispositivo a dispositivo.

// Server STUN: aiutano i dispositivi a trovarsi. Bastano sul Wi-Fi di casa.
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Server TURN (il "ponte" di riserva). Serve quando il collegamento diretto è
// bloccato, come succede spesso con le reti mobili 4G/5G e alcuni Wi-Fi
// universitari o aziendali.
//
// Come attivarlo, gratis (Open Relay di Metered, 20 GB al mese):
//   1. crea un account su https://www.metered.ca/tools/openrelay/
//   2. nella dashboard, sezione TURN Server, copia l'indirizzo delle credenziali:
//      https://NOMEAPP.metered.live/api/v1/turn/credentials?apiKey=LATUACHIAVE
//   3. incollalo qui sotto tra gli apici e salva.
// Lasciato vuoto, il gioco usa solo il collegamento diretto.
export const TURN_CREDENTIALS_URL = 'https://straccia-camicia.metered.live/api/v1/turn/credentials?apiKey=190daa31f68014e8baa4d8b16a40b3be0b1b';

// Prefisso per gli ID delle stanze sul server PeerJS (evita collisioni con altre app).
export const ROOM_PREFIX = 'straccia-camicia-it-v1-';
