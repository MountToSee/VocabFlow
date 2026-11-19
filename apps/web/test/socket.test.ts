import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VocabSocket } from '../src/lib/socket';

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    queueMicrotask(() => this.onclose?.());
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
}

describe('VocabSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reconnects after disconnect (React StrictMode effect replay)', async () => {
    const socket = new VocabSocket('ws://test/ws');
    const statuses: string[] = [];
    socket.onStatus((s) => statuses.push(s));

    socket.connect();
    socket.disconnect();
    socket.connect();
    await Promise.resolve();

    expect(FakeWebSocket.instances).toHaveLength(2);
    FakeWebSocket.instances[1]!.open();
    expect(socket.status).toBe('open');
    expect(statuses.at(-1)).toBe('open');
  });

  it('ignores close events from a superseded connection', async () => {
    const socket = new VocabSocket('ws://test/ws');
    socket.connect();
    socket.disconnect();
    socket.connect();
    const current = FakeWebSocket.instances[1]!;
    current.open();
    await Promise.resolve();

    socket.send({ type: 'ping' });
    expect(current.sent).toHaveLength(1);
    expect(socket.status).toBe('open');
  });

  it('does not reconnect after disconnect', async () => {
    vi.useFakeTimers();
    const socket = new VocabSocket('ws://test/ws');
    socket.connect();
    FakeWebSocket.instances[0]!.open();
    socket.disconnect();
    await vi.runAllTimersAsync();
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.useRealTimers();
  });
});
