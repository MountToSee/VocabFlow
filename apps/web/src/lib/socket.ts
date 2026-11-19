import type { ClientMessage, ServerMessage } from '@vocabflow/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

type Listener = (msg: ServerMessage) => void;
type StatusListener = (status: ConnectionStatus) => void;

function defaultUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

/**
 * Auto-reconnecting WebSocket client. While offline, only the most recent message per
 * key (e.g. the latest analyze request for a note) is queued and flushed on reconnect.
 */
export class VocabSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private queue = new Map<string, ClientMessage>();
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  status: ConnectionStatus = 'closed';

  constructor(private readonly url: string = defaultUrl()) {}

  connect(): void {
    this.stopped = false;
    if (this.ws) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.setStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.retry = 0;
      this.setStatus('open');
      for (const msg of this.queue.values()) ws.send(JSON.stringify(msg));
      this.queue.clear();
    };
    ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        return;
      }
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus('closed');
      if (this.stopped) return;
      const delay = Math.min(10_000, 500 * 2 ** this.retry++);
      this.timer = setTimeout(() => {
        this.timer = null;
        this.connect();
      }, delay);
    };
  }

  send(msg: ClientMessage, queueKey?: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else if (queueKey) {
      this.queue.set(queueKey, msg);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /** Closes the connection and stops reconnecting. `connect()` may be called again later. */
  disconnect(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.close();
      this.setStatus('closed');
    }
  }

  private setStatus(status: ConnectionStatus): void {
    this.status = status;
    for (const l of this.statusListeners) l(status);
  }
}
