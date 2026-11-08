# 验收与一致性现状

这一页记录「怎么量的、量出什么」，正文 README 只给结论。表里的数字都是真实浏览器 + CDP 跑出来的。

## 验收工具（`tools/cdp/`）

浏览器不可用时靠宿主信标；有 Chromium 时用真实 CDP 做数值断言（本机
`%LOCALAPPDATA%\ms-playwright\chromium-1243\chrome-win64\chrome.exe`，
`--headless=new --remote-debugging-port=9222`）。

| 工具 | 用途 |
| --- | --- |
| `node tools/cdp/parity.mjs <refUrl> <candUrl>` | 34 个探针逐项 diff 参考实现与移植版（tokens / 属性 / 计数 / 网格 / 几何 / Hero clip） |
| `node tools/cdp/audit.mjs <url> [--scope=#root]` | 真实页面逐元素算 WCAG 对比度，列出 ratio < 3 的可读性问题 |
| `node tools/cdp/why.mjs <url> <selector> <prop>` | 查某属性到底被哪条规则命中（`CSS.getMatchedStylesForNode`） |
| `node tools/cdp/click.mjs <url> <selector\|label> [--probe=f.js]` | 用真实鼠标事件点控件（合成 click 会被 React 忽略） |
| `node tools/cdp/shoot.mjs` / `evaluate.mjs` | 截图 / 跑任意表达式 |
| `node tools/cdp/settings-audit.mjs`、`settings-toggles.mjs` | 走设置面板、逐项切换开关并记录状态 |
| `node tools/cdp/controller-state.mjs <url> [--switch]` | 读 `__dshFairyController.state`（activity / lifecycle / boundSessionId），并可用真实鼠标切会话对比 |
| `node tools/cdp/activity-inject.mjs <url>` | 注入桩 Session 走出货代码路径，验证 thinking / comforting / idle 三种投影 |
| `node tools/cdp/session-activity.mjs` / `session-transition.mjs` | 观察 `.dsh-hdd-session-transition` 帧与 `data-fairy-state` 变化 |
| `node tools/cdp/i18n-motion.mjs <url>` | 切到 `en` 后重测所有语义锚点；再模拟 `prefers-reduced-motion: reduce` 验证过渡被跳过 |
| `node tools/cdp/voice-e2e.mjs <url>` | `/fairy-voice/status` → `/tts` → 32 kHz 实际播放 → 音频控件几何 |
| `node tools/cdp/reasoning-check.mjs <url>` | 15 项推理强度座不变量：`.re-model-trigger` 带模型名与等级（非纯图标）、弹窗标题「模型与推理强度」、无档位模型给出原因、切到有档位模型后出现 `.re-advanced` + 4 档滑条、拖动改等级并回读 trigger、刻度与文字对比度 ≥ 4.5、模型列表 12 项、点空白处关闭 |
| `node tools/cdp/persona-check.mjs <url>` | 13 项只读不变量：人设合成、身份条款、语料清单/读取/路径穿越、**真实组装里是否存在 `fairy:persona`**、TTS 配置与状态 |
| `node tools/cdp/tts-auth-check.mjs <hostUrl> <mockAuthUrl>` | 15 项 API Key 不变量：落盘、**不回显明文**、掩码末四位、探活与合成是否带 `Authorization: Bearer`、无关保存保留 key、`clearApiKey` 清除后不再发头（临时把端点指向 mock，结束恢复原值） |
| `node tools/cdp/yovoice-check.mjs <hostUrl> <token> <mockUrl>` | 13 项 yovoice 协议不变量：配置含 `protocol`/`modelId`/`voiceId`、保存后 `protocol=yovoice`、`/v1/status` 的 `ready` 判定、`/fairy-voice/engine` 拉到 models+voices、合成返回 `RIFF` WAV（32 kHz/16-bit）、探活与合成两条都带 `Bearer`、请求体含 modelId/voiceId |
| `node tools/mock-tts.mjs --port=9881` | GPT-SoVITS 兼容的假 TTS，用来验证整条语音链；`GET /__auth` 回报最近一次收到的 `authorization` 头 |
| `node tools/parity*` 见上 | — |

## 一致性现状

对同一份参考实例（`127.0.0.1:3357`）逐项对账，主题层已 1:1：

- 色板 `--dsw-alias-bg-base #07101c` / `layer-1 #0a1828` / `layer-2 #0e243d` /
  `label-primary #e8f2fa` / `brand-primary #62d4ff`
- `.dsh-hdd-background-host` + `.dsh-hdd-fx` 48px 网格（opacity .7）+ 3 层辉光
- `.dsh-fairy-stage` `[280,56,1760,586]`、`#dsh-fairy-root` 432×432
- 侧栏板 `[0,0,280,1200]`、品牌锚点、电源开关、Hero `left:1160px / clip inset(0 0 -477px 140px)`
- composer 卡 `[280,1068,1760,132]`（dock 激活态）
- WCAG：`--scope=#root` 无低对比项，最低 6.02
- 61 个 `data-dsh-fairy-*` 标记、88 个 `.dsh-fairy-*` / `.dsh-hdd-*` class 与参考完全重合

差异均可归因于环境而非实现：

| 现象 | 原因 |
| --- | --- |
| 参考少 `data-dsh-fairy-composer-{command,mode,reasoning}-control` 三个标记 | 参考 profile 额外装了 `dsh-reasoning-effort`、模式选择器；本 dev profile 只有 base+web-app+fairy，控件不存在自然无标记 |
| 参考侧栏无「插件 / 自动化任务」行、设置行为「设置」42px | 参考实例的 profile 未启用这些面板；本实例走官方 panellist 布局（HDD 开/关均一致，非主题改动） |
| 余额卡 `unavailable` | 0.2.1 的 `.credentials.yaml` 是结构化 `records:` 格式，没有参考实现读取的扁平 `DEEPSEEK_API_KEY`；把结构里的平台 grant token 直接当 API key 请求 `api.deepseek.com/user/balance` 会 401（已实测），所以这是凭据形态问题，参考实例同样 unavailable |
| 朗读按钮存在但不出声 | 需要外部本地 TTS 与参考音色样本，仓库不提供；**链路本身已验证**（见 [TTS.md](TTS.md) 与 `tools/cdp/voice-e2e.mjs`） |
| 我们的模型控件曾是 46×28 图标，参考是 220×28 带模型名的控件 | 那个控件来自参考 profile 里的 `dsh-reasoning-effort`（`re-model-root`），0.2.1 官方的模型入口只有图标（`_7KE1Ra_trigger`，DOM 里没有文字标签）。dev profile 现已装 `@ayanehana/dsh-reasoning-effort@0.9.0` 并让它走 fallback 分支，座位变为 220×28、显示模型名与推理等级，与参考同布局带 |

### 已验证的行为（真实浏览器 + 数值断言）

| 场景 | 结论 |
| --- | --- |
| 切换会话 | 出现 1 帧 `.dsh-hdd-session-transition`，`clip: inset(0 0 132px 280px)`，事后自清理（`overlaysLeftBehind: 0`） |
| 选择绑定 | `sessionId` 随点击在 `session-57ed9141…` / `session-8f2949bc…` 之间切换，`lifecycle` 从 `completed` 正确投影 |
| activity 三态 | 桩 Session 注入：`running` → `thinking`；含安慰语的最新用户消息 → `comforting`；`blank` → `lifecycle: idle` |
| 界面语言切英文 | `treeLabel` = `Sessions`、`newSessionLabel` = `New session`，舞台 / dock / 侧栏板 / 背景 host 几何与标记数不变 |
| `prefers-reduced-motion: reduce` | 静止与切换后过渡帧均为 0，glitch 动画不挂 |
| 语音链路（mock TTS） | `/fairy-voice/status` → `available:true`；`/tts` → `200 audio/pcm` 53 760 B；浏览器解码 0.6 s @32 kHz 实际出声 |
| 市场式安装（tarball） | 7 个 `pnpm pack` 产物装进全新 `DSH_HOME` 后：`--dump-config` 出现五行，五个 client bundle 全部进 roster，voice 宿主可用 |
| 市场式一键停/起 | 把锚包 patch 插入的五个 id 全部 `disabled: true` 后重启：roster 里不再有 `dsh-fairy-next-visual`，`/dsh-fairy/diag` 返回 **404**，日志无 fairy 相关 warning；去掉该层再启动即恢复（roster 命中、`diag.ok=true`） |
| 眼睛大小 / 动画速度滑条 | 真实拖拽后落盘（`mascotScale 0.73`），`#dsh-fairy-root` 上 `--dsh-fairy-mascot-scale: 0.76`、`data-dsh-fairy-animation-rate=1.5` |
| 选择模型 | 点击 → 「模型与推理等级」菜单 → 「模型」行 → 12 个 `menuitemradio`（两个 provider 组）→ 选中后按钮 `aria-label` 变为所选项 |
| 余额卡随侧栏收放 | 展开 `[14,1078,242,62]` 三行；收起后原生 rail 56px、卡片变 `[5,1104,36,36]` 只显示 `¥`（不再左溢 30px）；再展开回到 `[14,1078,242,62]`。收起信号取原生 `frame[data-sidebar-collapsed]` + 实测列宽（slot 出口是 `display:contents`，量不到） |
| 会话头部顺序与间距 | 2040/1680/1440/1280 四档一致：`统计 → H.D.D → 日间模式 → 用文件资源管理器打开 → 更多操作 → 打开右侧边栏`，间距 `8 | 8 | 0 | 8`（0 是官方两枚图标按钮的自身间距） |
| 空白会话（hero）兜底开关 | 与官方 `打开右侧边栏` 按钮 **overlap 0**（2040/1440/1280），兜底组停在 corner 按钮左侧 8px |
| 模型控件位置 | 右翼底行、发送按钮左侧 8px（`rel [1490,82,46,28]` vs `send rel [1544,82]`），与参考同一布局带 |
| 头部控件尺寸 | 仅缩尺寸、内容原样：`统计 52→40`、`H.D.D 68→58`、`日间模式 30→26`（宽），高度 26/28 与官方按钮一致；文字与参考新月画法未动 |
| 空白会话垂直对齐 | 兜底组与官方 corner 按钮顶端同为 **y=11、高 28**（此前偏上 2px），四档宽度一致 |
| 人设注入（真实组装） | `/dsh-fairy/persona/probe` 返回 8 个 section，`fairy:persona` 排第 3（紧跟 `deployment:persona-prefix`），注入 2213 字；改成自定义文本后立即变为 61 字（含 44 字身份条款），无需重启 |
| 身份条款 | `ling` → 「当前「主人」是铃」；切自定义（执笔者 / 第二助手 Fairy / 家庭成员 小铃）后合成文本多出两行，并同样进入 `fairy:persona` |
| 参考语料 | 11 份语料清单可用、按 id 读取 200、`../package.json` 穿越请求 404；插入 `canon/fairy_canon.json` 后合成从 2213 → 15 493 字 |
| 设置页 TTS 区块 | 真实 UI 上传参考音频：`referencePresent:true`、`referenceBytes:64044`、文件名回显；「测试连接」→「连接正常」；「试听」→ `POST /fairy-voice/tts 200`、43 520 B PCM 并提示「已播放试听」 |
| 设置页人设区块 | textarea `maxLength = -1`（不限字数）；真实输入 17 字并点「保存人设」→ `/dsh-fairy/persona` 立刻报告 `source:custom`、`chars:61`，提示「已保存，下一条消息生效」 |
| TTS API Key | 真实 UI 输入并保存 → 宿主 `apiKeySet:true`、`apiKeyMask:••••••••7788`、响应正文无明文；mock 侧 `/__auth` 收到 `Bearer sk-…`（探活与合成两条都带）；点「清除 API Key」→ `apiKeySet:false`、请求不再带该头；15 项不变量由 `tools/cdp/tts-auth-check.mjs` 全绿 |
| TTS 双协议 | 协议下拉切 `yovoice` 后出现模型/音色字段、「读取引擎模型/音色」从 mock 拉到 `mock-index-tts2` + `mock-voice-001`；「试听」返回 `audio/wav`（38444 B），浏览器 `decodeAudioData` 解码 43 564 B 后 `createBufferSource` 播放并提示「已播放试听」；切回 `gpt-sovits` 后上传控件恢复、模型字段消失；13 项不变量由 `tools/cdp/yovoice-check.mjs` 全绿 |
| 朗读控制胶囊（两段） | 左段红点 = 自动朗读开关，右段波形 = 语音音量并同时是拖动热区（原生 `range` 是 `opacity:0` 的覆盖层）。TTS 未就绪时：音量仍可拖（`1 → 0.75`、30 → 22 根亮条、`localStorage dsh.fairyVoice.volume=0.75`，刷新后保持），仅自动朗读禁用；胶囊 `data-dsh-fairy-engine-ready="false"`、`title` 显示不可用原因 |
| 真实 yovoice 引擎 | `GET /fairy-voice/engine` 从 `127.0.0.1:9880` 拉到 1 个模型（`index-2.5-f16`）+ 16 个导入音色（`卡芙卡 • …`、`Fairy • …`）；`/v1/status` 探活 `available:true`；生成时 502 且错误信息带上引擎原话（`语音生成失败：@yovoice.error.generateFailed`） |
| 右侧边栏原始承载面 | 按用户要求（m06540）撤回右栏蒙板、全屏网格/底色和三态 `ResizeObserver`：参考项目基于 0.1.1、没有 0.2.1 的右栏全屏，不能据此自绘；恢复原生 `_tabHost` 的 `background:var(--dsw-alias-bg-base)`，仅保留右栏 1px 分界线。停靠面板 `[1122,0,918,1200]`，全屏 `[0,0,2040,1200]`；全屏实测深色 `rgb(7,16,28)`、浅色 `rgb(247,250,252)`，均为纯色、无网格，底层对话不再透出 |
| 模型与推理强度弹窗 | 座位是 `@ayanehana/dsh-reasoning-effort` 的 fallback 组件：`.re-model-trigger` 220×28 @ `[1569,1154]`、文字 `DeepSeek-V4-Pro Max`；弹层 `aria-label="模型与推理强度"`（312 宽），有档位模型显示 `.re-advanced` + `.re-effort-input[max=3]`，无档位模型显示「当前模型未提供推理强度档位」；真实拖拽 `High → Off → Max`，trigger 的 `aria-label` 同步；深色刻度 4.95 / 选中 9.44 / 名称 7.87，浅色 5.87 / 5.82，全部 ≥ 4.5（`tools/cdp/reasoning-check.mjs`） |
| 推理滑条滑块 | 默认是参考站的白色圆钮（30×30、`border-radius:50%`、紫色辉光），插件自带的「大肥鱼」贴图改为 opt-in：勾选「推理滑条用大肥鱼贴图」后 `.re-effort-knob` 变成 `data:image/png` 贴图、40×55，取消勾选立刻回到圆钮；属性由 `data-dsh-fairy-chibi-thumb` 门控，`utils.js` 的 `MutationObserver` 负责插件后渲染的滑块。8 项不变量见 `.dsh-dev-home/chibi-thumb-check.mjs` |
| Fairy 控制台布局 | 五张卡片（HDD 视觉 / 身份与称呼 / 语音服务 / 语音简报 / 人设）在 564px 宽的面板里单列排布，内容总高 **1395px**（旧版裸 checkbox + `<hr>` 拼凑为 1877px）；折叠条展开后 1699px；卡片 12px 圆角、12px 标题 + 5px 发光圆点，开关是 34×20 的自绘 `input[type=checkbox]`（行为与 a11y 不变），两套主题 `lowContrast: 0`（`.dsh-dev-home/hub-audit.mjs`） |
| 语音简报挂载 | 语音简报面板由 voice 包 `createRoot` 挂进 Hub 的宿主节点：现在只在宿主是**新节点**时挂载（此前每次 DOM 变更都新建 React root，导致 `GET /fairy-voice/brain/status` 无限重发、状态行永远停在「正在读取配置…」），实测一次请求即显示「未配置。未配置时，长回答会直接使用原文朗读。」 |

### 设置面板的打开前提

`Ctrl + Alt + ,` 打开设置；**未登录时打开的是「开始使用」引导页而不是设置面板**
（`settings.section` 出口不会出现）。隔离实例要验收设置页，需要把
`~/.dsh/.credentials.yaml` 复制到 `.dsh-dev-home/`（该目录已在 `.gitignore` 里）。

已用真实鼠标事件逐项验收（`settings-mode-audit` 流程）：

| 控件 | 效果 |
| --- | --- |
| 启用 HDD 视觉 | `html[data-dsh-fairy-visual]` / `data-dsh-fairy-mode=hdd` 挂卸 |
| HDD 日间模式 | `theme=light`，`body` 背景 `rgb(247,250,252)`、`label-primary #172531`，与参考浅色配色一致 |
| 显示 Fairy 主视觉 | 舞台吉祥物显隐 |
| 低功耗模式 | `power-mode=low-power`，吉祥物 `[data-low-power]` 生效，装饰动画停 |
| Fairy 当前将我识别为 | 铃 / 哲 / 自定义（`fairy-identity` 命名空间持久化） |

