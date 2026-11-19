import { describe, expect, it } from 'vitest';
import { parseClientMessage } from '../src/protocol.js';

describe('parseClientMessage', () => {
  it('accepts a valid analyze message', () => {
    const msg = parseClientMessage(
      JSON.stringify({ type: 'analyze', noteId: 'n1', revision: 2, text: 'hi' }),
    );
    expect(msg).toMatchObject({ type: 'analyze', revision: 2 });
  });

  it('rejects malformed input', () => {
    expect(parseClientMessage('not json')).toEqual({ error: 'Invalid JSON' });
    expect(parseClientMessage(JSON.stringify({ type: 'lookup' }))).toHaveProperty('error');
  });
});
