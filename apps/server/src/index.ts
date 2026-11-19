import { createVocabFlowServer } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { server, close } = createVocabFlowServer({ config });

server.listen(config.PORT, config.HOST, () => {
  console.log(`VocabFlow server listening on http://${config.HOST}:${config.PORT} (ws: /ws)`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void close().then(() => process.exit(0));
  });
}
