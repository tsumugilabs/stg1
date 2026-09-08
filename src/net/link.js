import { ChannelTransport, PeerTransport } from './transport.js';

/**
 * Getting two browsers to find each other.
 *
 * Two ways in, deliberately:
 *
 *   TABS      BroadcastChannel, same machine, same browser. Needs nothing
 *             running anywhere and cannot fail for network reasons, so it is
 *             both how one person tests four seats and the fallback when the
 *             signalling service is unreachable.
 *   ONLINE    WebRTC through PeerJS's public broker. The broker introduces the
 *             two browsers and then gets out of the way — the game traffic is
 *             peer to peer and never touches it.
 *
 * A room code is four letters from an alphabet with no I, O, 0 or 1 in it,
 * because these get read out loud over a voice call.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'chronopilot-stg1-';

export function makeCode() {
  let code = '';
  for (let i = 0; i < 4; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export function tidyCode(text) {
  return String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

const SIGNAL_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js';
let signalLoad = null;

/** True once the signalling library is in memory. */
export function onlineAvailable() {
  return typeof window !== 'undefined' && typeof window.Peer === 'function';
}

/**
 * Fetches the signalling library, the first time somebody actually asks for
 * online play.
 *
 * Deliberately not a script tag in the page. Everyone who never plays online —
 * which is everyone, most of the time — would pay for that fetch on every
 * load, and anywhere the CDN is slow or blocked it turns into a console error
 * on a game that has nothing to do with the network. Loaded here, a blocked
 * CDN is one clear message on one screen.
 */
export function loadSignalling() {
  if (onlineAvailable()) return Promise.resolve(true);
  if (signalLoad) return signalLoad;
  signalLoad = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SIGNAL_SRC;
    tag.async = true;
    tag.onload = () => (onlineAvailable()
      ? resolve(true)
      : reject(new Error('オンライン接続の準備に失敗しました')));
    tag.onerror = () => {
      signalLoad = null;
      reject(new Error('オンライン接続の準備に失敗しました。同じ端末の別タブなら遊べます'));
    };
    document.head.appendChild(tag);
  });
  return signalLoad;
}

/**
 * Host over BroadcastChannel. Returns a handle; every new tab that knocks
 * becomes a transport handed to `onTransport`.
 */
export function hostOverTabs(code, onTransport) {
  const channel = new BroadcastChannel(`chronopilot.${code}`);
  // One channel hears everything, and routes it. Giving each peer its own
  // listening channel loses whatever was posted before that channel existed,
  // and a guest sends its name and its chosen craft in the same breath.
  const known = new Map();
  channel.onmessage = (event) => {
    const packet = event.data;
    if (!packet || packet.from === 'host') return;
    if (packet.to && packet.to !== 'host') return;
    let transport = known.get(packet.from);
    if (!transport) {
      transport = new ChannelTransport(code, 'host', packet.from, { listen: false });
      known.set(packet.from, transport);
      transport.onClose(() => known.delete(packet.from));
      onTransport(transport);
    }
    if (packet.kind === 'bye') {
      transport.fireClose();
      known.delete(packet.from);
      return;
    }
    if (packet.body) transport.deliver(packet.body);
  };
  return {
    kind: 'tabs',
    code,
    close() {
      try {
        channel.close();
      } catch {
        /* already gone */
      }
    },
  };
}

export function joinOverTabs(code) {
  return new ChannelTransport(code, randomId(), 'host');
}

/**
 * Host over PeerJS. Resolves once the broker has accepted the room id, which
 * is also the moment the code becomes worth showing to anybody.
 */
export async function hostOnline(code, onTransport) {
  await loadSignalling();
  return new Promise((resolve, reject) => {
    const peer = new window.Peer(PEER_PREFIX + code);
    let settled = false;
    peer.on('open', () => {
      settled = true;
      resolve({
        kind: 'online',
        code,
        close() {
          try {
            peer.destroy();
          } catch {
            /* already gone */
          }
        },
      });
    });
    peer.on('connection', (connection) => onTransport(new PeerTransport(connection)));
    peer.on('error', (error) => {
      if (settled) return;
      settled = true;
      // The one error worth translating: somebody already has this code.
      reject(new Error(String(error && error.type) === 'unavailable-id'
        ? 'そのルームコードは使われています'
        : 'ホストを開始できませんでした'));
    });
  });
}

export async function joinOnline(code) {
  await loadSignalling();
  return new Promise((resolve, reject) => {
    const peer = new window.Peer();
    let settled = false;
    peer.on('open', () => {
      const connection = peer.connect(PEER_PREFIX + code, { reliable: true });
      connection.on('open', () => {
        settled = true;
        resolve(new PeerTransport(connection));
      });
      connection.on('error', () => {
        if (settled) return;
        settled = true;
        reject(new Error('そのルームが見つかりません'));
      });
    });
    peer.on('error', () => {
      if (settled) return;
      settled = true;
      reject(new Error('そのルームが見つかりません'));
    });
    // A room that never answers is a room that is not there.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('そのルームが見つかりません'));
    }, 12000);
  });
}
