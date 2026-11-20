# DictionaryHelper (macOS)

Tiny Swift CLI wrapping `DCSCopyTextDefinition` (Dictionary Services) so the Node server can
query the built-in macOS dictionary with sub-millisecond latency over a persistent stdio pipe.

```bash
cd native/macos/DictionaryHelper
swift build -c release
.build/release/DictionaryHelper serendipity   # one-shot sanity check
```

The server picks up `.build/release/DictionaryHelper` automatically and starts it at boot so
the first lookup is already warm. To use a helper elsewhere, point the server at it:

```bash
MACOS_DICTIONARY_HELPER=/path/to/DictionaryHelper npm run dev
```

Without the helper, the server falls back to a JXA script via `osascript` (slower, no build
step). On non-macOS platforms the provider is disabled and the built-in lexicon / LLM are used.

For the App Store build this helper is bundled inside the app (or replaced by an in-process
call from the Swift/Tauri shell) — see `docs/architecture.md`.
