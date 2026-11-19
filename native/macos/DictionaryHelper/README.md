# DictionaryHelper (macOS)

Tiny Swift CLI wrapping `DCSCopyTextDefinition` (Dictionary Services) so the Node server can
query the built-in macOS dictionary with sub-millisecond latency over a persistent stdio pipe.

```bash
cd native/macos/DictionaryHelper
swift build -c release
.build/release/DictionaryHelper serendipity   # one-shot sanity check
```

Then point the server at it:

```bash
MACOS_DICTIONARY_HELPER=$PWD/.build/release/DictionaryHelper npm run dev
```

Without the helper, the server falls back to a JXA script via `osascript` (slower, no build
step). On non-macOS platforms the provider is disabled and the built-in lexicon / LLM are used.

For the App Store build this helper is bundled inside the app (or replaced by an in-process
call from the Swift/Tauri shell) — see `docs/architecture.md`.
