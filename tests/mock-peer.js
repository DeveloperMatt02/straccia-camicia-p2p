// Finto PeerJS per i test: collega le schede dello stesso browser con BroadcastChannel.
// Stessa interfaccia usata dal gioco: new Peer(id?), peer.connect(), eventi open/connection/data/close/error.
(() => {
  class Emitter {
    constructor() { this.h = {}; }
    on(e, f) { (this.h[e] ||= []).push(f); return this; }
    emit(e, ...a) { (this.h[e] || []).forEach(f => { try { f(...a); } catch (err) { console.error(err); } }); }
  }
  const rid = () => Math.random().toString(36).slice(2, 10);

  class DataConnection extends Emitter {
    constructor(peer, remote, connId, metadata) {
      super(); this.peerObj = peer; this.peer = remote; this.connId = connId; this.metadata = metadata; this.open = false;
    }
    send(m) {
      if (!this.open) return;
      this.peerObj.bc.postMessage({ type: 'data', connId: this.connId, to: this.peer, from: this.peerObj.id, payload: JSON.stringify(m) });
    }
    close() {
      if (!this.open) return;
      this.open = false;
      this.peerObj.bc.postMessage({ type: 'close', connId: this.connId, to: this.peer });
      delete this.peerObj.conns[this.connId];
      this.emit('close');
    }
  }

  class Peer extends Emitter {
    constructor(id, opts) {
      super();
      if (typeof id !== 'string') id = 'anon-' + rid();
      this.id = id; this.conns = {}; this.destroyed = false; this.disconnected = false;
      this.bc = new BroadcastChannel('mock-peerjs');
      this.bc.onmessage = e => this.onMsg(e.data);
      let taken = false;
      this.claimCheck = m => { if (m.type === 'taken' && m.id === id) taken = true; };
      this.bc.postMessage({ type: 'claim', id });
      setTimeout(() => {
        if (taken) { this.emit('error', { type: 'unavailable-id' }); return; }
        this.ready = true; this.emit('open', id);
      }, 80);
    }
    onMsg(m) {
      if (this.destroyed) return;
      this.claimCheck?.(m);
      if (m.type === 'claim' && m.id === this.id && this.ready) this.bc.postMessage({ type: 'taken', id: m.id });
      if (m.type === 'conn' && m.to === this.id && this.ready) {
        const c = new DataConnection(this, m.from, m.connId, m.metadata);
        this.conns[m.connId] = c;
        this.bc.postMessage({ type: 'accept', connId: m.connId, to: m.from });
        this.emit('connection', c);
        setTimeout(() => { c.open = true; c.emit('open'); }, 10);
      }
      if (m.type === 'accept' && m.to === this.id) {
        const c = this.conns[m.connId];
        if (c) { clearTimeout(c.failTimer); setTimeout(() => { c.open = true; c.emit('open'); }, 20); }
      }
      if (m.type === 'data' && m.to === this.id) {
        const c = this.conns[m.connId];
        if (c && c.open) c.emit('data', JSON.parse(m.payload));
      }
      if (m.type === 'close' && m.to === this.id) {
        const c = this.conns[m.connId];
        if (c) { c.open = false; delete this.conns[m.connId]; c.emit('close'); }
      }
    }
    connect(to, opts = {}) {
      const connId = rid();
      const c = new DataConnection(this, to, connId, opts.metadata);
      this.conns[connId] = c;
      this.bc.postMessage({ type: 'conn', from: this.id, to, connId, metadata: opts.metadata });
      c.failTimer = setTimeout(() => {
        if (!c.open) { delete this.conns[connId]; this.emit('error', { type: 'peer-unavailable' }); }
      }, 400);
      return c;
    }
    reconnect() {}
    destroy() {
      if (this.destroyed) return;
      Object.values(this.conns).forEach(c => c.close());
      this.destroyed = true; this.bc.close();
    }
  }
  window.Peer = Peer;
})();
