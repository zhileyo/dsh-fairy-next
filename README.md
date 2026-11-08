# dsh-fairy-next

> 把《绝区零》里 Fairy 的「空洞深潜系统（H.D.D）」做成 DeepSeek Harness 的插件主题套件：整站换肤、常驻吉祥物舞台、满宽 HUD 输入坞、语音朗读、余额/电量卡，以及每个新文档都落在空白会话页。

[![license](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![npm](https://img.shields.io/badge/npm-dsh--fairy--next-cb3837.svg)](https://www.npmjs.com/package/dsh-fairy-next)
[![dsh](https://img.shields.io/badge/DSH-0.2.1--rc.2-62d4ff.svg)](https://github.com/deepseek-ai/dsh)
[![node](https://img.shields.io/badge/node-%E2%89%A522.12-339933.svg)](package.json)
[![mirror](https://img.shields.io/badge/mirror-cnb.cool-1f6feb.svg)](https://cnb.cool/zhileyo/dsh-fairy-next)

![Fairy 主题界面](docs/assets/fairy-overview.webp)

本项目是 [Chengzhibense/Fairy-DSH](https://github.com/Chengzhibense/Fairy-DSH) 在
**DSH 0.2.1-rc.2** 上的移植与适配（上游按 0.1.1-rc.2 编写）。上游许可、逐项改动、第三方
许可与商标边界都收在 [NOTICE](NOTICE) 里，许可证全文见 [LICENSE](LICENSE)。

## 目录

- [特性](#特性)
- [快速开始](#快速开始)
- [包与目录](#包与目录)
- [配置](#配置)
- [开发](#开发)
- [验收](#验收)
- [打包与发布](#打包与发布)
- [仓库与镜像](#仓库与镜像)
- [待办](#待办)
- [贡献](#贡献)
- [许可](#许可)

## 特性

- **主题**：HDD 深空网格背景、Fairy 舞台与状态机、侧栏聚合物板、满宽 composer dock、
  Hero 投影、模式切换 glitch、独立设置页。
- **吉祥物**：眼睛大小 / 动画速度可调，低功耗模式停装饰动画，日间模式跟随浅色主题。
- **输入坞**：命令、模式、推理强度三枚控件与官方布局对齐，不新增固定占位。
- **语音**：朗读控制胶囊（自动朗读 + 音量热区）、波形、参考音频上传，支持
  `gpt-sovits` 与 `yovoice` 两种协议，不可用时静默降级。
- **余额/电量**：侧栏底部余额卡 + 今日 token 估算，HDD 模式下文案变「今日电量」。
- **启动行为**：每个新 document 落到空白会话页，不再恢复上次会话。
- **人设**：不限字数的人设正文 + 身份条款 + 11 份参考语料按需插入。
- **浏览器 dock**：配合 `@playwright/mcp` 的 stdio 代理，给自动化留一个可见浏览器。

## 快速开始

需要 **Node ≥ 22.12**、**pnpm 11**（`packageManager` 已锁 `pnpm@11.28.5`）。

装进一个已有 DSH 有两种方式（插件市场，或用 `node tools/pack-all.mjs` 打出的 tarball），产物怎么来见
[打包与发布](#打包与发布)。想在不碰 `~/.dsh` 的隔离实例里试主题，见 [开发](#开发)。

进入 DSH 后按 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>,</kbd> 打开设置，四类配置都收在
「Fairy 控制台」一页（见 [配置](#配置)）。**未登录时打开的是「开始使用」引导页而不是设置面板。**

## 包与目录

市场只需要安装 `packages/dsh-fairy-next`（锚包）：它的 `skin.json` 让宿主把它识别成主题，
`cordis.patch.yml` 一次插入下面五条插件行，市场据此一键停/起整组。

| 包 | 职责 | 客户端产物 |
| --- | --- | --- |
| `dsh-fairy-next` | 锚包：市场安装入口，只有声明文件 | — |
| `dsh-fairy-next-visual` | 主题主体（背景、舞台、输入坞、设置页） | `src/client/` → rollup |
| `dsh-fairy-next-startup` | 新 document 落到空白会话页 | `lib/client.js` 即源码 |
| `dsh-fairy-next-balance` | 余额卡与今日 token 估算 | `lib/client.js` 即源码 |
| `dsh-fairy-next-voice` | 朗读控制、波形、TTS 配置页（宿主半边 + 客户端半边） | `lib/client.js` 即源码 |
| `dsh-fairy-next-browser-dock` | 浏览器 dock 与 `@playwright/mcp` 的 stdio 代理（`proxy.cjs`） | `src/client/` → rollup |
| `dsh-fairy-next-contracts` | 跨包只读契约（命名空间、DOM 锚点、词汇表） | 纯 ESM，不打包 |

七个包**同一个版本号、一起发布**：锚包声明的是 `^0.1.0` 这类范围，所以版本只能整批动
（`node tools/bump-version.mjs <version>` 会改七份 manifest 和锚包的依赖范围，并提示
regenerate lockfile）。「有 `src/client/`」与「`lib/client.js` 就是源码」的区别决定了改动落在
哪一层，`tools/build-all.mjs` 按目录是否存在来分流，细节见 [AGENTS.md](AGENTS.md)。

```text
tools/                         构建（build-all / build-client / verify-build）、打包
                               （pack-all）、发布（bump-version / pin-versions /
                               prepare-publish / publish-npm，npm 调用统一走 npm-cli）、
                               开发实例（dev-setup / dev-start.ps1）、验收（cdp/*）、mock
                               （mock-tts）、迁移脚本
dev/profile/                   隔离开发实例用的 DSH profile（junction 进 .dsh-dev-home）
docs/                          REPO / TTS / ADAPTATION / VERIFICATION
packages/*/test/               各包的纯函数单测
.cnb.yml                       CNB 侧拉取式镜像流水线（见「仓库与镜像」）
.github/workflows/             发 npm 的 publish-npm（打 tag 触发）
```

`node_modules/`、`.dsh-dev-home/`、`.dsh-market-home/`、`.pnpm-store/` 都是本地产物，已 gitignore。

## 配置

设置 →「Fairy 控制台」把四类配置收在同一页（`settings.section` 只占一个导航格）：

| 区块 | 内容 | 存放位置 |
| --- | --- | --- |
| HDD 视觉 | 启用 HDD、日间模式、显示主视觉、低功耗、推理滑条用大肥鱼贴图 | `$DSH_HOME/fairy-visual/settings.json` |
| 身份 | 铃 / 哲 / 自定义（自定义时另有第二助手、家庭成员） | `$DSH_HOME/fairy-identity/identity.json` |
| 语音服务（TTS） | 协议（`gpt-sovits` / `yovoice`）、`ttsUrl`、`docsUrl`、API Key（可选，Bearer）、参考音频提示文本、参考音频文件（≤24 MB，wav/mp3/flac/ogg/m4a）、yovoice 的模型与音色 id、保存 / 测试连接 / 试听 / 读取引擎模型音色 / 清除 API Key | `$DSH_HOME/fairy-voice/tts-config.json`，音频落在 `$DSH_HOME/fairy-voice/runtime/reference/` |
| Fairy 人设 | 字数不限的人设正文（留空 = 内置参考人设），可检索并插入 11 份参考语料 | `$DSH_HOME/fairy-persona/persona.json` |

页面本身是一张张卡片（HDD 视觉 / 身份与称呼 / 语音服务 / 语音简报 / 人设），每行「标题 + 说明 +
开关」，一次性配置（端点、鉴权、参考语料）收在可展开的 `连接与鉴权` / `参考语料` 折叠条里——
设置面板只有约 560px 宽，全展开会把页面撑到三屏，折叠后一屏能看到五张卡片的标题。

这几份配置怎么进入模型：

- **人设**以 `fairy:persona` **section**（`order: 100`，`interpolate: false`）注入系统提示词，
  `text` 是函数 → **每次组装都会重新求值**，保存后下一条消息即生效，不用重启。
  `/dsh-fairy/persona/probe` 会跑一次真实组装，回报 `sectionNames`、注入长度、身份条款是否命中。
- **身份**（铃/哲/自定义 + 家庭成员）在合成时以「【本次会话身份】…」追加到人设末尾，由
  `src/persona.js` 的 `identityClause()` 生成，不依赖模型猜称呼。
- **参考语料**按需插入（单份或全部），上限 400 000 字符；全部插入约 400 KB，token 成本很高，
  UI 里有明确提示。
- **TTS 地址与鉴权**：界面保存的值**优先于** `DSH_FAIRY_TTS_URL` / `DSH_FAIRY_DOCS_URL` /
  `DSH_FAIRY_TTS_APIKEY`，环境变量只是默认值（`/fairy-voice/config` 的 `env.overridden` 会说明
  当前是否被界面覆盖）。搬运整套配置只需拷贝 `$DSH_HOME/fairy-voice/`。
- **API Key 只写不读**：`GET /fairy-voice/config` 永远返回 `apiKey: ""`，只给 `apiKeySet` 与末四位
  掩码 `apiKeyMask`；留空提交表示「保持不变」，清空要点「清除 API Key」（`clearApiKey: true`）。
  设置后探活与合成请求都带 `Authorization: Bearer <key>`，未设置则完全不带该头（本地
  GPT-SoVITS 不受影响）。Key 以明文存在 `tts-config.json`（与 `voice-brain.json` 同属本机凭据
  文件，权限随 `$DSH_HOME`）。

两种 TTS 协议的差异（`gpt-sovits` 回流 raw PCM、`yovoice` 回流 WAV 走 `decodeAudioData`，
探活分别看 `/docs` 与 `GET /v1/status`），以及引擎 `/v1/models`、`/v1/voices` 的补全方式，见
[docs/TTS.md](docs/TTS.md)。

新增的宿主路由：`GET /fairy-voice/config`、`POST /fairy-voice/config/update`、
`POST /fairy-voice/reference`、`GET /dsh-fairy/persona`、`GET /dsh-fairy/persona/corpus`、
`GET /dsh-fairy/persona/corpus/file?id=`、`GET /dsh-fairy/persona/probe`。

## 开发

```powershell
pnpm install                     # 根目录：构建工具链
node tools/build-all.mjs         # 只重建有 src/client 的包，其余保留上游预构建产物
node tools/verify-build.mjs      # 校验 bundle 形态、id、裸 require 白名单

# 隔离开发实例（独立 DSH_HOME，不碰 ~/.dsh）
node tools/dev-setup.mjs
pwsh -File tools/dev-start.ps1 -Port 3400            # 起服务并打印带 token 的 URL
pwsh -File tools/dev-start.ps1 -Port 3400 -WithChrome  # 同时起 CDP 9222，供 tools/cdp/* 用
pwsh -File tools/dev-start.ps1 -Port 3400 -WithBalance # 允许余额卡读真实凭据文件（opt-in）
```

手工起也可以，注意两点：`dsh web` 子命令自带 profile 语义，直接 `dsh web` 会以 `web`
profile 启动；且 `--profile` 与 `DSH_PROFILE` 不能同时给。

```powershell
$env:DSH_HOME='D:\Projects\dsh-fairy-next\.dsh-dev-home'; Remove-Item Env:DSH_PROFILE -ErrorAction SilentlyContinue
node node_modules\@deepseek-ai\dsh\lib\bin.js --profile fairy-dev --no-open --port 3400
# token 在 .dsh-dev-home\boot-NN.log 里：token=([A-Za-z0-9_\-]+)
```

从 0.1.1 迁到 0.2.1 时必须改掉的四处不兼容点见 [docs/ADAPTATION.md](docs/ADAPTATION.md)。

### 推理强度座（第三方插件）

参考项目的「模型与推理强度」弹窗不是参考仓库自写，而是
[`dsh-reasoning-effort`](https://github.com/HanaAyane/dsh-reasoning-effort) 插件
（参考站用 0.1.1 时代的 `0.6.2`）。本 dev profile 装的是作者为 0.2.x 重写的
`@ayanehana/dsh-reasoning-effort@0.9.0`（`dev/profile/package.json`，同时列入
`dsh.profile.bundles`）。

该版本在 0.2.1 上会走「包装原生模型按钮」的分支，而它按 `menu.aria` 这个字典键去匹配原生菜单——
0.2.1 的原生菜单 aria 是「模型与推理等级」，字典里只有 `model.menuAria`，永远匹配不上，于是推理面板
静默缺失。参考项目那张 `.re-model-menu` 来自同一份代码的 **fallback** 分支（`AdvancedModelSelect`），
因此开发环境用一次性补丁让它落到 fallback：

```powershell
node tools/patch-reasoning-effort.mjs          # 幂等；重装插件后再跑一次
node tools/patch-reasoning-effort.mjs --check  # 只检查是否已打
```

我们只替换座位的来源，不改插件语义；主题侧只加了两类样式：恢复
`--dsh-composer-model-text-display`（composer 行是 `display:contents`，原生
`container-type:inline-size` 会量到 0 宽而退化成纯图标），以及把推理等级与刻度提到
WCAG 4.5:1 以上。

## 验收

主题层的每一项结论都有对应的可复跑脚本（真实 Chromium + CDP 数值断言，不是截图目测）：

```powershell
node tools/cdp/parity.mjs <refUrl> <candUrl>     # 34 项探针对账参考实现与移植版
node tools/cdp/persona-check.mjs <url>           # 人设 / 身份 / 语料只读不变量
node tools/cdp/reasoning-check.mjs <url>         # 推理强度座 15 项不变量
node tools/mock-tts.mjs --port=9881              # 假 TTS，验完整语音链
```

除 `mock-tts` 外都要一个带 CDP 的实例，用 [开发](#开发) 里的 `-WithChrome` 起。

工具清单、一致性现状、已验证行为、差异归因见 [docs/VERIFICATION.md](docs/VERIFICATION.md)。

## 打包与发布

发布到 npmjs 交给 [`.github/workflows/publish-npm.yml`](.github/workflows/publish-npm.yml)：
**打 tag 就发**，也可以在 GitHub 页面手动跑一次（默认只 dry-run）。

```powershell
git tag v0.1.0; git push origin v0.1.0            # tag 跟着锚包版本走，如 v0.1.0
gh workflow run publish-npm --repo zhileyo/dsh-fairy-next   # 手动：默认 dry_run=true
gh workflow run publish-npm --repo zhileyo/dsh-fairy-next -f dry_run=false   # 真发
```

工作流顺序：`pnpm install --frozen-lockfile` → `prepare-publish.mjs --dry`（先审计每个包会发
哪些文件）→ `pin-versions.mjs` → `build-all` → `verify-build` → `pack-all.mjs`（打出七个 tarball
和 `pack-manifest.json`）→ `publish-npm.mjs --dry-run` 或 `publish-npm.mjs`。发的是**这一步打出来
的 tarball**，不是包目录：本地验过的字节就是 registry 收到的字节。顺序是 contracts → visual →
startup → balance → voice → browser-dock → 锚包（依赖在前）；registry 上已存在的 `name@version`
直接跳过，所以重复触发是安全的。

```powershell
node tools/pack-all.mjs --install-test           # 本地：打包 + 装一遍核验
node tools/publish-npm.mjs --dry-run             # 本地：走完检查，不上传
```

稳态的发布凭据是 **OIDC（Trusted Publisher）**，仓库里不需要长期 token。
这些关系**只能在 npm 网页上逐包点**，因为本仓库账号开了 2FA（`auth-and-writes`），而
`npm trust` 的创建路径不送 OTP，`create` 与 `list` 一律 `E403`；换成绕过 2FA 的 granular token
也不行，registry 会把话说明白：`Granular access tokens that bypass two-factor authentication may
not perform this action`（[原因](https://gh.io/npm-gat-bypass2fa-deprecation)）。

七个包各点一次，填同样的三项：

- 包页 → Settings → Trusted Publisher → GitHub Actions
- Repository：`zhileyo/dsh-fairy-next`
- Workflow filename：`publish-npm.yml`
- 勾上允许 `npm publish`

`node tools/trust-publisher.mjs --check` 只对没有 2FA 的账号可用；本账号读也会 403。
配好之后**要在 2 天内完成一次发布**：npm 用第一次成功发布把关系绑定到仓库的不可变身份，
超时作废，只能删掉重配。

工作流用 Node 24 自带的 npm 11 —— Trusted publishing 要求 npm ≥ 11.5.1，Node 22 自带 npm 10，
换不到 OIDC 令牌。也别给 `setup-node` 设 `registry-url`：那会写一行
`_authToken=${NODE_AUTH_TOKEN}` 到 `.npmrc`，而 OIDC 这条路上那个变量必须为空。

**首版只能用 token 引导一次，这不是可选项**：Trusted Publisher 只能挂在已经存在的包上，
而上面那两条限制把 CLI 与 token 两条路都堵死了。`0.1.0` 就是这么发的：

1. npm 网页上建一个 granular token（Packages 读写、允许绕过 2FA、有效期压到几天），
   `gh secret set NPM_TOKEN --repo zhileyo/dsh-fairy-next`；
2. 手动跑工作流，`dry_run=false` + `bootstrap_token=true` —— 这一步把 token 写进
   runner 的 `.npmrc`，再把七个 `0.1.0` 发出去（已存在的版本会自动跳过，可重复跑）；
3. 包存在之后，回到上面那段网页步骤给七个包建 Trusted Publisher；
4. 删掉 secret，以及工作流里的 `authenticate with the bootstrap token` 步骤和
   `bootstrap_token` 输入。之后打 `v*` tag 就只走 OIDC。

打包前提：

- 七个包**同一个版本号**（当前全部 `0.1.0`），一起发。改版本只走
  `node tools/bump-version.mjs <x.y.z>`：它同时改七份 manifest 与锚包的 `^` 范围，之后记得
  `pnpm install --lockfile-only` 并把锁文件一起提交（importers 记的是依赖声明）。锚包声明的范围
  必须覆盖得住这一批发出的版本，否则装上后内部依赖会解析到旧包（原因见
  [包与目录](#包与目录)）；
- `dsh-fairy-next-voice` 还要装 `mdast-util-from-markdown` / `mdast-util-gfm` /
  `micromark-extension-gfm`——缺了它的**宿主半边**会 import 失败，表现为启动日志一行
  `warning: 1 entry did not activate`，其余插件与整页仍正常（0.2.1 对宿主侧失败是告警，
  客户端侧失败才会驻留启动页）。
- `pack-all` 按依赖顺序把七个包打到 `.dsh-market-home/pkgs`，并校验三件只有打出来才看得见的
  事——`files` 里写的条目真的在包里、`main`/`exports` 指向的文件也在包里、锚包声明的范围覆盖
  得住这一批的版本；`--install-test` 再把这批 tarball 真装进临时目录核一遍（要联网，
  `dsh-fairy-next-voice` 有三个 mdast 依赖得从 registry 解析）。别用 `pnpm pack`：那是 pnpm
  自带的“把当前目录打成包”，会把整个 workspace 打成 `dsh-fairy-next-workspace-0.0.0.tgz`。


## 仓库与镜像

| 角色 | 位置 | 谁能写 |
| --- | --- | --- |
| **真源** | <https://github.com/zhileyo/dsh-fairy-next>（公开） | 开发者本地 `git push` |
| **镜像（只读）** | <https://cnb.cool/zhileyo/dsh-fairy-next> | 只有 `.cnb.yml` 的 git-sync 流水线 |

```powershell
git push origin main             # origin = GitHub，只往这里推
```

CNB 是**拉取式**镜像：CNB 自己的 `.cnb.yml` 每小时用
[`tencentcom/git-sync`](https://cnb.cool/cnb/plugins/tencentcom/git-sync) 的 pull 模式从 GitHub
拉取最新提交，也可以在 CNB 页面手动触发一次。GitHub 侧只有一个发 npm 的工作流，不负责镜像，
也不会反过来推 CNB。

```yaml
main:
  "crontab: 0 * * * *":
    - name: pull-from-github
      stages:
        - name: git-sync
          image: tencentcom/git-sync
          settings:
            target_url: https://github.com/zhileyo/dsh-fairy-next.git
            sync_mode: pull
```

拉取是逐字节镜像，所以**两边 commit SHA 完全一致**，可以直接比对。`.cnb.yml` 本身也因此躺在
GitHub 仓库里——它就是镜像机制本身，不是噪音。

建仓只需要人工搬一次历史（CNB 云端导入 GitHub 地址，或者在空仓上 `git push cnb main`）：
CNB 得先在分支里读到 `.cnb.yml`，才知道有这条拉取流水线。之后就是纯拉取、每次都是快进，
**不需要任何 `--force` 推送**。迁移步骤与 `cnb` CLI 用法见 [docs/REPO.md](docs/REPO.md)。

## 待办

- [x] 会话切换 glitch（`dsh-hdd-session-transition`）在 0.2.1 的复验
- [x] Voice 端到端链路（mock TTS 已验证；换成真实模型只需改 `DSH_FAIRY_TTS_URL`）
- [x] 市场安装路径（tarball 装进全新 `DSH_HOME`，五个插件全部就位）
- [x] 中英 i18n 与 `prefers-reduced-motion` 的逐项回归
- [x] 三个 UI 缺陷：眼睛大小滑条不生效、输入框选不了模型、头部控件位置/间距
- [x] 市场式一键停/起（禁用锚包插入的五个 id → 全部下线；恢复后重新上线）
- [x] 语音服务配置界面（地址 / 参考音频上传 / 提示文本 / 测试连接 / 试听，落盘 + 界面优先于环境变量）
- [x] 身份设置真正生效（合成到人设末尾，随每次组装求值）
- [x] 人设配置项（不限字数）+ 参考项目语料全量搬入（11 份，按需插入）
- [ ] 接真实 TTS 引擎（GPT-SoVITS 零改动，或 IndexTTS2 + 适配器）——见 [docs/TTS.md](docs/TTS.md)
- [ ] 真正走一遍插件市场的 catalog 安装（当前用 tarball + patch 覆盖层等价验证）
- [ ] 参考语料的「按需切片」（当前只有整份插入；参考项目由 `fairy-core.runtime` 按场景抽样）

## 贡献

改动前先读 [AGENTS.md](AGENTS.md)：构建/校验/隔离实例的全部命令、必须守住的运行时契约
（路由前缀、`localStorage` 键、CSS 前缀、`$DSH_HOME` 目录）、以及 `.cnb.yml` 只能做拉取
镜像这条硬约束都在那里。

- 开发只推 GitHub：`git push origin main`；CNB 是只读镜像，规则见 [仓库与镜像](#仓库与镜像)。
- 提交信息用 conventional commits（`feat:` / `fix:` / `docs:` / `chore:` / `ci:`）。
- 改主题或布局后跑一次 `node tools/verify-build.mjs`；有 Chromium 时再跑
  `tools/cdp/parity.mjs` 与 `tools/cdp/audit.mjs`（见 [docs/VERIFICATION.md](docs/VERIFICATION.md)）。
- 问题与建议走 [Issues](https://github.com/zhileyo/dsh-fairy-next/issues)。

## 许可

Apache-2.0，见 [LICENSE](LICENSE)。上游出处、逐项改动（20 条）、第三方组件许可与
《绝区零》相关名称/形象的使用边界都在 [NOTICE](NOTICE) 里——它就是本仓库唯一的
归属与声明文件。
