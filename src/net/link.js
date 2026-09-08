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
/**
 * What actually went wrong, in words a player can act on.
 *
 * Every failure used to come back as "room not found", which is the one
 * message that is useless: a broker outage, a blocked network, a browser that
 * cannot do WebRTC and a genuinely mistyped code all read the same, so neither
 * the player nor anybody helping them can tell which it was.
 */
export function describePeerError(error) {
  const type = String((error && error.type) || '');
  switch (type) {
    case 'peer-unavailable':
      return 'そのルームは見つかりません。コードを確認するか、ホストに開き直してもらってください';
    case 'unavailable-id':
      return 'そのルームコードは使われています。もう一度ホストしてください';
    case 'network':
      return '接続サーバーに届きません。回線を確認して、少し待ってからやり直してください';
    case 'server-error':
      return '接続サーバーが応答しません。少し待ってからやり直してください';
    case 'socket-error':
    case 'socket-closed':
      return '接続サーバーとの通信が切れました。もう一度お試しください';
    case 'browser-incompatible':
      return 'このブラウザはオンライン対戦に対応していません';
    case 'webrtc':
    case 'disconnected':
      return '相手と直接つなげませんでした。回線によっては塞がれていることがあります';
    case 'ssl-unavailable':
      return '安全な接続を確立できませんでした';
    default:
      return type ? `接続に失敗しました (${type})` : '接続に失敗しました';
  }
}

const RECONNECT_DELAYS = [400, 1000, 2500, 5000];

/**
 * Keeps a peer's link to the broker alive.
 *
 * PeerJS drops its signalling connection on any network hiccup and after a
 * spell of sitting idle, and it does not come back on its own. A host that has
 * been disconnected is no longer discoverable, so the room simply stops
 * existing while its screen still shows the code — which is exactly what a
 * host reading their code out loud to a friend is doing when it happens.
 */
function keepAlive(peer, onStatus) {
  let attempt = 0;
  let closed = false;
  peer.on('disconnected', () => {
    if (closed || peer.destroyed) return;
    onStatus('reconnecting');
    const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
    attempt += 1;
    setTimeout(() => {
      if (closed || peer.destroyed) return;
      try {
        peer.reconnect();
      } catch {
        onStatus('lost');
      }
    }, delay);
  });
  peer.on('open', () => {
    attempt = 0;
    onStatus('open');
  });
  peer.on('close', () => onStatus('lost'));
  return () => { closed = true; };
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
    const handle = {
      kind: 'online',
      code,
      status: 'connecting',
      error: '',
      peer,
      close() {
        handle.stop();
        try {
          peer.destroy();
        } catch {
          /* already gone */
        }
      },
    };
    handle.stop = keepAlive(peer, (status) => {
      handle.status = status;
      if (status === 'open') handle.error = '';
    });
    peer.on('open', () => {
      if (settled) return;
      settled = true;
      handle.status = 'open';
      resolve(handle);
    });
    peer.on('connection', (connection) => onTransport(new PeerTransport(connection)));
    peer.on('error', (error) => {
      const message = describePeerError(error);
      if (!settled) {
        settled = true;
        reject(new Error(message));
        return;
      }
      // After the room is up, an error is worth showing but not fatal: the
      // reconnect above may well fix it, and dropping the room would throw
      // away everybody already in it.
      handle.error = message;
    });
  });
}

/** How many times a join is retried before it is called a miss. */
const JOIN_ATTEMPTS = 3;
const JOIN_TIMEOUT = 9000;

/**
 * Join a room. Retried a few times: a host that is mid-reconnect reports as
 * "no such peer" for a second or two, and giving up on the first answer turns
 * a hiccup into "that room does not exist".
 */
export async function joinOnline(code, onStatus = () => {}) {
  await loadSignalling();
  let last = new Error('接続に失敗しました');
  for (let attempt = 1; attempt <= JOIN_ATTEMPTS; attempt += 1) {
    onStatus(attempt === 1 ? 'connecting' : `retry:${attempt}`);
    try {
      return await attemptJoin(code);
    } catch (error) {
      last = error;
      // A code nobody is answering may still be a host coming back; anything
      // else is not going to improve by asking again immediately.
      if (!error.retryable || attempt === JOIN_ATTEMPTS) break;
      await new Promise((r) => setTimeout(r, 900 * attempt));
    }
  }
  throw last;
}

function attemptJoin(code) {
  return new Promise((resolve, reject) => {
    const peer = new window.Peer();
    let settled = false;
    const fail = (error, retryable) => {
      if (settled) return;
      settled = true;
      const wrapped = new Error(typeof error === 'string' ? error : describePeerError(error));
      wrapped.retryable = retryable;
      try {
        peer.destroy();
      } catch {
        /* already gone */
      }
      reject(wrapped);
    };
    peer.on('open', () => {
      const connection = peer.connect(PEER_PREFIX + code, { reliable: true });
      connection.on('open', () => {
        if (settled) return;
        settled = true;
        resolve(new PeerTransport(connection));
      });
      connection.on('error', (error) => fail(error, true));
    });
    peer.on('error', (error) => {
      const type = String((error && error.type) || '');
      // Worth another go: the host may be reconnecting, or the broker may be
      // briefly unhappy. A browser that cannot do WebRTC will never improve.
      fail(error, type === 'peer-unavailable' || type === 'network'
        || type === 'server-error' || type === 'socket-error');
    });
    setTimeout(() => fail('ルームが応答しませんでした。ホストの画面が「待機中」になっているか確認してください', true), JOIN_TIMEOUT);
  });
}
