# VocabFlow

Offline-first notes app with an integrated, contextual dictionary and a real-time
language-learning engine that uses your own writing as study material.

- **Distraction-free Markdown editor** ([MDXEditor](https://mdxeditor.dev)) with focus mode (`Ctrl/Cmd + .`).
- **Real-time corrections over WebSockets** — instant rule-based hints on every pause, then
  streamed AI corrections paragraph by paragraph. Underlines are drawn with the CSS Custom
  Highlight API; click one to apply a fix.
- **Contextual dictionary** — rest the pointer on a word for an instant definition peek, or
  select / double-click a word or short phrase: the native macOS dictionary answers instantly,
  then an LLM explains what it means _in your sentence_ with fitting synonyms. Save it to
  review straight from the popover.
- **Study deck from your own writing** — save looked-up words; review them as cloze cards
  built from the sentence you wrote, scheduled with spaced repetition (SM-2).
- **Latency-aware AI fallback** — cloud LLM → local model (Ollama) → offline heuristics,
  with per-provider timeouts, cooldowns and slow-provider demotion.

## Repository layout

```
apps/
  server/   Node + TypeScript: HTTP + WebSocket analysis and lookup service
  web/      React + TypeScript (Vite) client with MDXEditor
packages/
  shared/   WebSocket protocol (zod), shared types, text + spaced-repetition utilities
native/
  macos/DictionaryHelper/   Swift CLI wrapping macOS Dictionary Services
docs/       Architecture and desktop release notes
```

## Getting started

Requires Node.js 20+ (`.nvmrc` pins 22).

```bash
npm install
cp apps/server/.env.example apps/server/.env   # optional: configure LLM providers
npm run dev                                     # server on :8787, web on :5173
```

Open http://localhost:5173.

With no LLM configured, VocabFlow runs fully offline on heuristics plus the system dictionary
(macOS) or a small built-in lexicon (other platforms). To enable AI features:

| Provider                  | Setup                                                                    |
| ------------------------- | ------------------------------------------------------------------------ |
| Cloud (OpenAI-compatible) | Set `OPENAI_API_KEY` (and optionally `OPENAI_BASE_URL`, `OPENAI_MODEL`). |
| Local (Ollama)            | `ollama pull llama3.2:3b` and keep Ollama running. Enabled by default.   |

`LLM_PROVIDERS` sets the priority order (default `openai,ollama`; empty = offline only) and
`LLM_LATENCY_BUDGET_MS` the per-request budget before falling back. Server env vars are
loaded from the process environment (e.g. `node --env-file=apps/server/.env`, or export them).

For instant native lookups on macOS, build the Swift helper — see
[`native/macos/DictionaryHelper`](native/macos/DictionaryHelper/README.md).

## Scripts

| Command                                                 | Description                              |
| ------------------------------------------------------- | ---------------------------------------- |
| `npm run dev`                                           | Server (tsx watch) + web (Vite) together |
| `npm run build`                                         | Build all workspaces                     |
| `npm test`                                              | Vitest across all workspaces             |
| `npm run typecheck` / `npm run lint` / `npm run format` | Static checks                            |
| `npm run check`                                         | Everything CI runs                       |

## Architecture

See [docs/architecture.md](docs/architecture.md) for the data flow, WebSocket protocol, fallback
strategy, and the plan for the macOS / App Store desktop release.
