import type { Capabilities } from '@vocabflow/shared';
import { useEffect, useState } from 'react';
import { VocabSocket, type ConnectionStatus } from '../lib/socket';

export function useVocabSocket() {
  const [socket] = useState(() => new VocabSocket());
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  useEffect(() => {
    const offStatus = socket.onStatus(setStatus);
    const offMsg = socket.subscribe((msg) => {
      if (msg.type === 'hello') setCapabilities(msg.capabilities);
    });
    socket.connect();
    return () => {
      offStatus();
      offMsg();
    };
  }, [socket]);

  useEffect(() => () => socket.dispose(), [socket]);

  return { socket, status, capabilities };
}
