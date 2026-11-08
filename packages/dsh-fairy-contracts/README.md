# DSH Fairy Contracts

Immutable contracts shared by the Fairy plugins: the setting namespaces, the
document markers the plugins read from each other, and the diagnostic helper.
Nothing here touches the DOM, the network or storage, and nothing here holds
mutable state.

That last point is why this package has no `./client` export. A DSH client
bundle is built once per package, and two plugins sharing one mutable browser
singleton is exactly the failure this package exists to avoid — so it ships
constants and pure functions, and each plugin bundles them into its own client.

## Surface

`index.js` re-exports the stable names:

| Name | Value |
| --- | --- |
| `FAIRY_VISUAL_SETTINGS_NAMESPACE` | `fairy-visual` |
| `FAIRY_IDENTITY_SETTINGS_NAMESPACE` | `fairy-identity` |
| `FAIRY_VISUAL_SETTINGS_VERSION` | `2` |
| `FAIRY_VISUAL_THEMES` | `dark`, `light` |
| `FAIRY_VISUAL_POWER_MODES` | `normal`, `low-power` |
| `FAIRY_VISUAL_ACTIVITY` | `normal`, `thinking`, `comforting` |
| `FAIRY_VISUAL_LIFECYCLE` | `idle`, `preparing`, `running`, `interrupted`, `completed`, `failed`, `disposed` |
| `FAIRY_VOICE_CONTROL_ATTRIBUTE` | `data-dsh-fairy-voice-control` |

`diagnostics.js` exports `FAIRY_LOG_PREFIX` (`DSH_FAIRY_LOG`),
`FAIRY_LOG_SCHEMA_VERSION` (`1`), `createFairyDiagnostics()` and
`normalizeFairyError()`. The helper redacts anything whose key looks like a
credential, truncates long strings, and caps depth and breadth so one log line
cannot grow without bound.

## Why the two `.cjs` files

`client-dom.cjs` and `client-diagnostics.cjs` are CommonJS because the plugin
client bundles are built against a `require` shim; a client module can require
them and get the same constants the host half uses. `types.d.ts` carries the
TypeScript shape for consumers that want it.

```sh
node --check index.js
node --check diagnostics.js
node -e "import('./index.js').then((m) => { if (m.FAIRY_VISUAL_SETTINGS_VERSION !== 2) process.exit(1) })"
```

Names exported here are a compatibility surface: the plugins persist settings
under these namespaces, so a rename is a data migration, not a cosmetic change.
