# dsh-fairy-next

Fairy theme suite for DSH (DeepSeek Harness), installed as one package. This is
the anchor, and it is deliberately empty: its host half exports
`name = 'fairy'` with an empty `apply()`, so it has no runtime behaviour of its
own.

What it actually carries is the wiring.

| File | Role |
| --- | --- |
| `skin.json` | market card (id `fairy`, tagline, tags, accent) plus the wiring record the host uses to mount the visual bundle |
| `cordis.patch.yml` | the bundle patch: five entries that register the sibling plugins in a profile |
| `icon.svg` | card icon |
| `lib/index.js` | empty host half |

The five patch entries are `fairy-visual` → `dsh-fairy-visual`,
`fairy-startup` → `dsh-fairy-startup`, `balance-meter` →
`dsh-fairy-balance`, `fairy-voice` → `dsh-fairy-speech` and
`browser-dock` → `dsh-fairy-dock`. Each entry is a separate
plugin load, which is why a broken sibling degrades to one inactive entry
instead of taking the whole skin down. Removing a line is how you disable that
plugin.

Install the suite by installing this package; `dependencies` pulls the other six
at the same version. There is no `./client` export here on purpose: a package
may declare exactly one `dsh.client` bundle, and the install surface is not
where that bundle belongs.

```sh
node --check lib/index.js
```

When bumping, change all seven packages together — `node tools/bump-version.mjs
<version>` in the repository root does the manifests and the anchor's caret
ranges, and the repository README explains the rest of the release path.
