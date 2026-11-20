# Architecture

## Overview

```
┌──────────────── apps/web (React) ────────────────┐        ┌──────────── apps/server (Node) ────────────┐
│ MDXEditor ──► plain text (DOM) ──► useAnalysis   │  ws    │ session ──► AnalysisEngine                 │
│   ▲  CSS Custom Highlights ◄── issues            │◄──────►│   ├─ heuristics (instant, offline)         │
│   └─ double-click ──► useLookup                  │  /ws   │   └─ LLM per paragraph (cached by hash)    │
│ notes + study deck in localStorage (offline)     │        │ LookupPipeline                             │
└──────────────────────────────────────────────────┘        │   ├─ define: macOS dict → local lexicon    │
                                                            │   └─ explain: LLM (contextual)             │
                                                            │ LatencyAwareRouter: cloud → local → null   │
                                                            └────────────────────────────────────────────┘
```

### Offline-first

Notes and the study deck live on the client (localStorage today; IndexedDB/SQLite later).
The server is a stateless analysis + lookup service designed to run **locally** next to the
UI (as a sidecar in the desktop app), so the app keeps working with no network: heuristics
and the system dictionary need nothing remote. The WebSocket client auto-reconnects and keeps
only the latest pending analyze request per note while disconnected.

### Real-time analysis

1. The editor emits the rendered plain text (Markdown syntax stripped, blocks joined by blank
   lines) after a 350 ms pause. Each request carries a monotonically increasing `revision`.
2. The server cancels any in-flight analysis for that note, immediately sends
   `analysis:issues` (`source: "heuristic"`), then streams `analysis:issues` (`source: "llm"`,
   `partial: true` until the last paragraph) and finally `analysis:done` with the strategy used.
3. LLM results are cached per paragraph hash, so editing one paragraph only re-sends that one.
4. The client ignores messages for stale revisions and verifies `text[start:end] === original`
   before drawing a highlight, so out-of-date offsets never mark the wrong text.
5. Applying a suggestion selects the DOM range and uses `insertText`, which the editor
   (Lexical) handles natively, preserving undo history; a Markdown rewrite is the fallback.

### Lookup pipeline

`lookup` → `lookup:definition` (first dictionary hit, typically < 5 ms) →
`lookup:explanation` (LLM, within the latency budget, or `null`).

- **macOS Dictionary Services** via the Swift helper (persistent process, line-delimited JSON),
  or JXA through `osascript` when the helper is not built.
- **Local lexicon** — small bundled list for non-macOS dev and tests.
- **LLM** — contextual meaning + synonyms that fit the user's sentence.

### LLM fallback strategy

`LatencyAwareRouter` tries providers in priority order (default: cloud, then local Ollama):

- hard timeout per call = `LLM_LATENCY_BUDGET_MS`; on timeout/error the provider enters an
  exponential cooldown (30 s doubling, max 5 min) and the next provider is tried;
- providers whose rolling (EWMA) latency exceeds 60 % of the budget are demoted behind
  faster ones — a slow cloud model yields to the local model but remains a fallback;
- if nothing answers, callers degrade to heuristics only (`strategy: "heuristics-only"`).

Both providers use the OpenAI-compatible Chat Completions API, so LM Studio, llama.cpp
server, vLLM, etc. work by changing the base URL.

## WebSocket protocol

Defined in `packages/shared/src/protocol.ts` (client messages validated with zod).

| Direction | Type                                                   | Purpose                                                                                                               |
| --------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| C→S       | `analyze`                                              | `{ noteId, revision, text }`                                                                                          |
| C→S       | `lookup`                                               | `{ requestId, word, context? }`                                                                                       |
| C→S       | `ping`                                                 | keepalive                                                                                                             |
| C→S       | `rewrite` `{requestId, paragraph, focus?}`             | whole-paragraph rewrite; `focus` = phrase the writer was unsure about                                                 |
| S→C       | `rewrite:result` `{rewrite, final, latencyMs}`         | offline phrasebook first (`final: false` when AI is configured), then the AI rewrite (budget `LLM_REWRITE_BUDGET_MS`) |
| S→C       | `hello`                                                | capabilities (native dictionary, LLM providers, budget)                                                               |
| S→C       | `analysis:start` / `analysis:issues` / `analysis:done` | streamed analysis                                                                                                     |
| S→C       | `lookup:definition` / `lookup:explanation`             | two-phase lookup                                                                                                      |
| S→C       | `error`                                                | validation or internal error                                                                                          |

The server binds to `127.0.0.1` and rejects browser origins not listed in `ALLOWED_ORIGINS`
(requests without an `Origin`, e.g. from a native shell, are allowed).

## macOS / App Store release plan

The codebase is split so the desktop shell is an additive step:

1. **Shell** — wrap `apps/web` in a native container (Tauri or Electron; Tauri recommended
   for size and a Swift-friendly native layer) as a new `apps/desktop` workspace.
2. **Server as sidecar** — bundle `apps/server` (`npm run build` produces a single ESM file)
   with an embedded Node runtime, or port the pipeline into the shell's native layer; the
   WebSocket protocol stays the same either way.
3. **Native dictionary** — ship `DictionaryHelper` inside the app bundle (or call
   `DCSCopyTextDefinition` in-process). Dictionary Services is a public API and works inside
   the App Sandbox.
4. **Storage** — move notes/deck from localStorage to SQLite in the app container, with
   optional iCloud sync.
5. **Sandbox & signing** — App Sandbox entitlements: `com.apple.security.network.client`
   (cloud LLM / local Ollama on localhost). Code-sign and notarize the helper and sidecar
   binaries along with the app; store API keys in the Keychain.
