# DSH Browser Dock

This package owns the in-app browser surface: a docked panel that shows a live
frame of a page, plus the stdio proxy that drives `@playwright/mcp` behind it.
It is independent from the Fairy skin — the panel appears whether or not the HDD
theme is active.

## Host half

`lib/index.js` is a file-backed state machine, not an in-memory one, so a
browser reload reconnects to the same session. Everything lives in
`$DSH_HOME/browser-dock`:

| File | Role |
| --- | --- |
| `state.json` | current state: active page, revision, takeover availability |
| `command.json` | outbound commands for the proxy (`bind`, `close`, `takeover`) |
| `control-token` | the token the control route requires |

Four exact routes are registered on the host web server:

| Route | Returns |
| --- | --- |
| `/browser-dock/state` | the current state as JSON, `no-store` |
| `/browser-dock/events` | server-sent events; a `state` event when the file changes |
| `/browser-dock/frame` | the current frame as an image, keyed by `?revision=` |
| `/browser-dock/control` | accepts a command only with the control token, at most 2048 bytes |

The watcher is a `fs.watch` on the runtime directory with the handle closed on
disposal. Control requests are compared against the token file, and a
`takeover` is accepted exactly once per revision — a stale revision is refused
rather than silently ignored.

## proxy.cjs

A stdio MCP proxy: it spawns the Playwright MCP child, relays newline-delimited
JSON in both directions, keeps a keepalive, watches `command.json` for the
commands above, and removes its runtime files on exit or signal. Point an MCP
client configuration at this file when the dock must share one browser session
with other tools.

## Client half

`src/client/index.js` is bundled by rollup into `lib/client.js`; the panel
renders the frame through an `<img>` pointed at `/browser-dock/frame`, fits the
aspect ratio on load, and re-requests when the revision changes.

The upstream reference also ships a prebuilt `lib/index.iife.js`; it is not
included here, because the runtime loads the bundle this repository builds from
`src/client/`.

```sh
node --check lib/index.js
node --check lib/client.js
node --check proxy.cjs
node --test test/*.test.js
```

The tests cover the control contract, the startup path and the state watcher.
