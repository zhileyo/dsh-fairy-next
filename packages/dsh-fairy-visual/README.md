# DSH Fairy Visual

This package owns the visible half of the Fairy skin: the HDD presentation, the
big-eye stage, the composer dock and the semantic marker system. It is the only
package in the suite that both persists settings and paints the document.

## Host half

`lib/index.js` keeps the persisted settings documents and serves them over the
host router. Every namespace is a separate file under `$DSH_HOME`; the defaults
and the merge rules live here, not in the browser:

| Namespace | File | Notes |
| --- | --- | --- |
| `fairy-visual` | `fairy-visual/settings.json` | schema version `2`, validated on read and stamped on write |
| `fairy-identity` | `fairy-identity/identity.json` | no version stamp |
| `fairy-persona` | `fairy-persona/` | persona corpus and the composed prompt sections |

Routes live under `ROUTE_PREFIX = '/dsh-fairy'` (see `lib/index.js:22`), take
bounded JSON bodies (`MAX_BODY_BYTES = 2 MiB`), and are registered only when the
`webServer` service exists — without it the debug logger says so and the plugin
keeps running with persistence only.

The host also injects a persona section into the system prompt, immediately
after the deployment persona prefix and before the plan policy. When the
`systemPrompt` service is unavailable the section is skipped and a warning is
logged; nothing else changes.

## Client half

The browser code is `src/client/` — 54 modules, bundled by rollup into
`lib/client.js`. This is the one package whose client file is a build product:

```sh
node ../../tools/build-client.mjs .    # or pnpm build from the repository root
node ../../tools/verify-build.mjs      # module id, wrapper shape, no relative require
```

Shipped files are `lib` and `assets`; the persona corpus under
`assets/persona/` is data, not code, and is copied verbatim. The client sources
under `src/client/` stay in the repository — the runtime only loads the bundle.

Client code cannot touch node built-ins, and `verify-build.mjs` rejects a
relative `require()` outright — the bundle only sees platform modules plus what
`dsh.client.inject` declares.

## Presentation invariants

- Copy exists in both Chinese and English; the theme must not depend on one.
- Under `prefers-reduced-motion: reduce` every transition frame is 0.
- Text contrast stays at or above **4.5:1** in both `dark` and `light` themes.
- The document contract other plugins read is read-only: the `bodyAttr` from
  `skin.json`, the published visual snapshot, and the marker attributes from
  `dsh-fairy-contracts` (`data-dsh-fairy-*`).

Runtime identifiers are a compatibility surface, not branding: the routes,
`localStorage` keys and CSS prefixes keep their original `dsh-fairy` spelling
because user data and host contracts already point at them.

## Verification

There is no unit-test directory in this package; the behaviour is verified
against a real browser through the CDP scripts described in
[docs/VERIFICATION.md](https://github.com/zhileyo/dsh-fairy-next/blob/main/docs/VERIFICATION.md).
