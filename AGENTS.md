# AGENTS.md

给在本仓库动手的 AI agent 与贡献者的操作手册。人类向的介绍、截图和配置说明在
[README.md](README.md)；这一页只回答三件事：**怎么跑、改哪里、别碰什么**。

## 项目是什么

`dsh-fairy-next` 是一组 **DSH（DeepSeek Harness）插件包**，把《绝区零》Fairy 的
「空洞深潜系统（H.D.D）」做成主题：整站换肤、吉祥物舞台、满宽输入坞、语音朗读、
余额卡、空白会话页启动行为。目标宿主版本 **DSH 0.2.1-rc.2**，上游移植自
[Chengzhibense/Fairy-DSH](https://github.com/Chengzhibense/Fairy-DSH)（按 0.1.1-rc.2 编写）。

## 环境

| 项 | 值 |
| --- | --- |
| Node | `>=22.12.0`（根 `engines`） |
| 包管理器 | `pnpm@11.28.5`（`packageManager` 锁定） |
| 链接方式 | `nodeLinker: hoisted`、`linkWorkspacePackages: true`、`preferWorkspacePackages: true` |
| 宿主 | `@deepseek-ai/dsh@0.2.1-rc.2`（根 devDependency） |
| 当前开发机 | Windows + PowerShell（示例命令都用 `pwsh`） |

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm install` | 装根工具链与七个 workspace 包 |
| `pnpm build` / `node tools/build-all.mjs` | 重建**有 `src/client`** 的包的 `lib/client.js`；其余保留上游预构建产物 |
| `pnpm verify` / `node tools/verify-build.mjs` | 校验客户端 bundle 的四条不变量（见下） |
| `pnpm run pack:all` / `node tools/pack-all.mjs [--install-test]` | 按依赖顺序把七个包打成 tarball 到 `.dsh-market-home/pkgs`，写出 `pack-manifest.json`，校验 `files`/`main`/`exports` 一致与内部版本范围；`--install-test` 再装进临时目录核一遍（要联网）。注意 `pnpm pack` 是 pnpm 自带命令，不是这个脚本 |
| `node tools/publish-npm.mjs [--dry-run]` | 按 `pack-manifest.json` 逐条 `npm publish <tgz>`，跳过 registry 上已有的版本；发布只走它，不要按目录 publish |
| `node tools/bump-version.mjs <x.y.z>` | 七包同一版本号：改七份 manifest 与锚包的 `^` 范围，之后 `pnpm install --lockfile-only` |
| `node tools/build-client.mjs packages/<pkg>` | 只重建一个包 |
| `node tools/dev-setup.mjs` | 准备隔离实例：`.dsh-dev-home/` + `profiles/fairy-dev` junction → `dev/profile` |
| `pwsh -File tools/dev-start.ps1 -Port 3400` | 起隔离实例并打印带 token 的 URL；`-WithChrome` 同时起 CDP 9222，`-WithBalance` 允许余额卡读真实凭据 |
| `node tools/patch-reasoning-effort.mjs [--check]` | 让第三方推理强度插件落到 fallback 分支（幂等，重装插件后要重跑） |
| `node tools/pin-versions.mjs` | 把包间 `link:` 依赖改写成版本范围（发布前） |
| `node tools/prepare-publish.mjs` | 生成待发布包元数据（homepage/repository/bugs/author 都由 `REPO_URL` 派生） |
| `node tools/mock-tts.mjs --port=9881` | GPT-SoVITS 兼容假 TTS，用来验完整语音链 |
| `node tools/cdp/<name>.mjs <url>` | 真实 Chromium + CDP 数值断言（清单见 [docs/VERIFICATION.md](docs/VERIFICATION.md)） |
| `node tools/gen-theme-ramp.mjs`、`port-packages.mjs`、`rename-packages.mjs` | 一次性迁移/生成脚本，平时不用跑 |

`verify-build.mjs` 检查的四条（只查有 `dsh.client` 的包）：

1. `lib/client.js` 存在；
2. 以 `window.__ModuleLoader__.load({` 开头，以 `});` 结尾；
3. bundle 里的 `id:` **等于包名**；
4. 同步 `require()` 只允许平台模块表 + `package.json` 的 `dsh.client.external` +
   `react/jsx-dev-runtime`；**相对路径 `require()` 直接失败**。

## 硬约束

1. **运行时标识符是兼容面，不要顺手改名。** 项目名早已是 `dsh-fairy-next`，但下面这些
   属于宿主契约或用户已有数据的落盘位置，改动即破坏兼容：
   - 宿主路由 `/dsh-fairy/settings`、`/dsh-fairy/persona*`、`/fairy-voice/*`
   - `ROUTE_PREFIX = '/dsh-fairy'`（`packages/dsh-fairy-next-visual/lib/index.js:22`）
   - `localStorage` 键 `dsh-fairy:debug`、`dsh.fairyVoice.volume`
   - CSS 前缀 `.dsh-fairy-*`、`.dsh-hdd-*`，DOM 标记 `data-dsh-fairy-*`
   - `$DSH_HOME/fairy-visual`、`fairy-identity`、`fairy-voice`、`fairy-persona`
2. **`.cnb.yml` 是 CNB 侧拉取镜像本体。** 只允许 `tencentcom/git-sync` +
   `sync_mode: pull` + `crontab`/`web_trigger`；不要加 push 触发，也不要建从 CNB 反向推
   GitHub 的流水线——那会和拉取形成回环。改动后要重新解析定时任务（只有 `.cnb.yml`
   变更的那次 push 才会刷新）。
3. **只往 GitHub `origin` 推。** CNB 是只读镜像；`git push cnb` 只用于新仓库首次 bootstrap。
4. **七个包同一个版本号、一起发布。** 改版本只走 `node tools/bump-version.mjs <x.y.z>`
   （它改七份 manifest 与锚包的 `^` 范围），随后 `pnpm install --lockfile-only` 并一起提交，
   否则锚包的依赖范围与发出的版本脱节、装上后会解析到旧包。发布走
   `.github/workflows/publish-npm.yml`（打 `v*` tag 或手动触发，默认 dry-run），发的是
   `pack-all` 打出来的 tarball，不要改回按目录 publish。
5. **搞清楚 `lib/client.js` 是产物还是源码。** `visual`、`browser-dock` 有 `src/client/`：
   改源，然后 `tools/build-all.mjs` 重建，直接改 `lib` 会被下次构建覆盖。`balance`、`startup`、
   `voice` **没有** `src/client/`：它们的 `lib/client.js` 就是源码（上游预构建后手工移植成
   module-loader 形态，见 `tools/port-packages.mjs`），`build-all` 会明确跳过——这三个包要直接改
   `lib`。改之前先看 `packages/<pkg>/src` 在不在，别改错文件。

## 代码约定

- ESM（`"type": "module"`），除非必要不新增依赖；客户端 bundle 不能碰 node 内置模块。
- 主题侧的样式改动要同时满足：中英两套文案锚点、`prefers-reduced-motion: reduce`
  下过渡帧为 0、文字对比度 **≥ 4.5:1**。
- 文档与注释用中文；注释写「为什么」，不写「做了什么」。
- 提交信息用 conventional commits：`feat:` / `fix:` / `docs:` / `chore:` / `ci:`。

## 文档地图

| 文件 | 内容 |
| --- | --- |
| [README.md](README.md) | 特性、安装、配置面、开发、打包、镜像拓扑 |
| [docs/ADAPTATION.md](docs/ADAPTATION.md) | 0.1.1 → 0.2.1 的四处不兼容点与改法 |
| [docs/VERIFICATION.md](docs/VERIFICATION.md) | `tools/cdp/` 工具清单、一致性现状、已验证行为、差异归因 |
| [docs/TTS.md](docs/TTS.md) | 两种 TTS 协议的选型与接入 |
| [docs/REPO.md](docs/REPO.md) | 仓库迁移/建镜像的逐步操作清单 + `cnb` CLI 用法 |
| [NOTICE](NOTICE) / [LICENSE](LICENSE) | 上游出处、20 条改动说明、第三方许可、商标边界（NOTICE 是唯一的归属文件，不要拆） |

## 已知陷阱

- `dsh web` 子命令自带 profile 语义，直接 `dsh web` 会以 `web` profile 启动；
  `--profile` 与 `DSH_PROFILE` **不能同时给**。
- 隔离实例的 `DSH_HOME` 是 `.dsh-dev-home`（已 gitignore）。**未登录时 `Ctrl+Alt+,` 打开的是
  「开始使用」引导页而不是设置面板**，要验收设置页得先把 `~/.dsh/.credentials.yaml` 复制进去。
- pnpm 在无 TTY 环境下会打 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，属正常，不影响
  `build` / `verify`。
- `tools/dev-start.ps1` 里的 node 路径是写死的（`C:\Users\yolo\...`），换机器要改。
- 本机沙箱下 git 的 credential helper（`git-credential-manager.exe`）走 shell 会失败
  （`couldn't create signal pipe`、`failed to execute prompt script`）；可用
  `git -c http.sslBackend=openssl -c "http.https://github.com/.extraheader=Authorization: basic <base64(x-access-token:TOKEN)>"`。
  `gh` CLI 可用，`Invoke-WebRequest` 走 HTTPS 会 SSL 失败，别用它探测 GitHub/CNB。
- `.dsh-dev-home/`、`.dsh-market-home/`、`.pnpm-store/`、`.agents/` 都是本地产物，不要提交。
