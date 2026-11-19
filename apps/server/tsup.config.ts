import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  clean: true,
  // Bundle the TS-source workspace package; keep npm deps external.
  noExternal: ['@vocabflow/shared'],
});
