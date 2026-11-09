# DSH Fairy Voice

This package owns spoken output: when an assistant reply finishes, the client
half asks the host half to synthesise it through an external local TTS runtime
and plays the returned audio. It ships no model, no reference audio and no game
assets — the runtime and the voice are the user's own.

## Host half

`lib/index.js` registers ten exact routes on the host web server, all under
`/fairy-voice`:

| Route | Purpose |
| --- | --- |
| `status`, `prepare` | readiness and per-turn preparation |
| `config`, `config/update` | read and write the TTS configuration |
| `reference`, `engine` | reference-audio upload and engine/model catalogue |
| `tts` | the synthesis call itself, streamed |
| `brain/status`, `brain/config`, `brain/brief` | the "short brief" path that condenses a long reply before speaking it |

Two environment variables redirect the runtime without editing code:
`DSH_FAIRY_TTS_URL` (default `http://127.0.0.1:9880/tts`) and
`DSH_FAIRY_DOCS_URL` (default `http://127.0.0.1:9880/docs`). They are overrides
for a GPT-SoVITS-compatible server, including a mock — see
[docs/TTS.md](https://github.com/zhileyo/dsh-fairy-next/blob/main/docs/TTS.md)
for both supported protocols.

Configuration and uploaded reference audio are written atomically (`open` →
`write` → `rename`) under `$DSH_HOME`, with `chmod 0600` on anything that can
carry a credential.

## Markdown without dependencies

Turning a reply into the brief that gets spoken needs markdown parsing, and this
package used to pull `mdast-util-from-markdown`, `mdast-util-gfm` and
`micromark-extension-gfm` for it — 59 packages once their transitive closure is
counted. That broke the suite's single-package promise: the anchor inlines the
six sub-packages, but nothing inlines *their* third-party dependencies, so an
install still had to reach the registry.

`lib/server/markdown-speech.js` therefore does the job line by line: fenced
code, tables, images and inline code are dropped, links keep their text, block
boundaries become `；` pauses, and inline HTML tags are stripped while their
text stays. The file's header lists the places where it deliberately differs
from a real markdown AST (indented code blocks are read aloud, block-level HTML
containers keep their text). Nothing in the suite depends on npm anymore.

## Client half

`lib/client.js` is hand-written source, not a build product: it injects the
speaker control next to finished replies, respects the read-only
`data-dsh-fairy-voice-control` marker from `dsh-fairy-contracts`, and keeps
the user's volume in `localStorage` under `dsh.fairyVoice.volume`.

## Verification

```sh
node --check lib/index.js
node --check lib/client.js
node --test test/*.test.js
```

The tests cover the client contract, the route surface and the brief builder's
performance budget. Browser behaviour is verified through the CDP scripts in
[docs/VERIFICATION.md](https://github.com/zhileyo/dsh-fairy-next/blob/main/docs/VERIFICATION.md).
