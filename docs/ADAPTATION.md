# 与 DSH 0.1.1 的必要适配

本仓库把上游按 **0.1.1-rc.2** 写的实现移植到 **0.2.1-rc.2**。
下面是四处必须改的不兼容点，改法都在对应包的注释里。

1. **`ctx.settingsScope` 在 0.2.1 已不存在** → `dsh-fairy-next-visual/src/client/scope-shim.js`
   用宿主路由 `GET/PUT /dsh-fairy/settings?ns=<namespace>` 复刻
   `getSnapshot()/subscribe()/set()` 三个方法，数据落在 `$DSH_HOME/fairy-visual/settings.json`
   与 `$DSH_HOME/fairy-identity/identity.json`（原子写）。
2. **DOM 漂移** → `dom-adapter.js` 同时接受 `[data-slot="main.conversation"]` 与
   `[data-composer-input]`（0.2.1 的输入是 contenteditable div，不是 textarea）；
   `[data-phase="plain"]` **不能**当成 active，那是 composer 自己的词表。
3. **`sessions.clear()` 不存在** → `dsh-fairy-next-startup` 降级为「能清就清」，
   否则 0.2.1「任一 entry 失败即整体失败」会让整页白屏。
4. **`sessions.list.getSnapshot().current` 不存在** → 0.1.1 的选中会话在 `sessions.list`
   快照上，0.2.1 搬到了 **`uiSession.current`**（`getSnapshot().key` 才是 SessionId）。
   上游直接读旧字段会得到 `undefined`，于是「切换会话」永远检测不到、
   `activity/lifecycle` 永远停在 `normal/idle`。`session-source.js` 做了这个转接层
   （懒解析 + 兼容 `getSnapshot()`/`.value`），并把 `uiSession` 加进 `inject`。

