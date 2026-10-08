// Configurazione di rete. Il gioco usa PeerJS: il server pubblico gratuito di
// PeerJS serve solo a "presentare" i telefoni tra loro, poi le carte viaggiano
// direttamente da dispositivo a dispositivo.
//
// I server STUN qui sotto bastano quasi sempre (Wi-Fi di casa, 4G/5G).
// Se con qualche rete (alcune reti aziendali/universitarie o operatori mobili)
// gli amici non riescono a entrare, puoi aggiungere un server TURN gratuito:
// ad esempio crea un account gratis su https://www.metered.ca/stun-turn e
// incolla qui le credenziali che ti dà, nel formato:
//   { urls: 'turn:XXXX.relay.metered.ca:80', username: '...', credential: '...' },
export const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

// Prefisso per gli ID delle stanze sul server PeerJS (evita collisioni con altre app).
export const ROOM_PREFIX = 'straccia-camicia-it-v1-';
