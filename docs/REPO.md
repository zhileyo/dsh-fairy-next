# 仓库拓扑与迁移清单

## 拓扑

| 角色 | 位置 | 谁能写 |
| --- | --- | --- |
| **真源** | <https://github.com/zhileyo/dsh-fairy-next> | 开发者本地 `git push` |
| **镜像（只读）** | <https://cnb.cool/zhileyo/dsh-fairy-next> | 只有 `.cnb.yml` 里的 git-sync 拉取流水线 |

数据流是单向的：

```
本地开发 ──push──▶ GitHub（真源） ──CNB 定时 pull──▶ CNB（镜像）
```

CNB 侧**没有任何推送 GitHub 的流水线**，GitHub 侧也没有 workflow。CNB 的
`.cnb.yml` 用 [`tencentcom/git-sync`](https://cnb.cool/cnb/plugins/tencentcom/git-sync)
的 `sync_mode: pull` 主动拉取，每小时一次，也可以手动触发。

拉取是逐字节镜像，所以**两边 commit SHA 完全一致**、可以直接比对。这也是
`.cnb.yml` 会出现在 GitHub 仓库里的原因：它就是镜像机制本身。

## 迁移状态

GitHub 侧已完成：

- 仓库已改名 `zhileyo/dsh-fairy` → **`zhileyo/dsh-fairy-next`**（旧地址 302 重定向，公开）；
- `main` 上已经有改成拉取式镜像的提交（`chore(repo): make GitHub the source of
  truth and CNB a pull mirror`），它的 SHA 就是 CNB 要对齐的目标，
  用 `git ls-remote origin main` 现取，别照抄文档。

CNB 侧走**删旧建新**：不做 `push --force`、不改写任何历史。新仓库先把 GitHub
的完整历史搬一次，之后全靠定时拉取快进，两边自然同 SHA。

## CNB 侧操作（删旧建新）

### 1. 删除旧仓库

`zhileyo/dsh-fairy` → **设置 → 删除仓库**。

旧的 `one-mugen/dsh-fairy` 是这个仓库改名前的路径（实测两个地址
`git ls-remote` 返回同一个 head），删掉后两个旧地址一起失效。删之前确认没有
其他人的 clone 还在往里推。

### 2. 新建 `zhileyo/dsh-fairy-next`

右上角 `+` → **创建仓库**，组织选 `zhileyo`，名字 `dsh-fairy-next`，
**不要**勾选初始化 README / .gitignore，保持空仓。

空仓是刻意的：镜像仓库里不允许有 GitHub 没有的提交，否则每次拉取都会变成
非快进而失败。

### 3. 首次把 GitHub 的历史搬进去（二选一）

为什么需要这一步：CNB 得先在本仓库的某个分支里读到 `.cnb.yml`，才知道有拉取
流水线；空仓没有分支，定时任务无从解析。所以第一次要“人工搬一次”，之后才是
纯拉取。

**A. 云端导入（不动本地）**

新仓库里进 **云原生开发**，欢迎页有「迁移已有仓库」，粘贴
`https://github.com/zhileyo/dsh-fairy-next.git`，一键导入完整历史。导入后
SHA 与 GitHub 一致，后续拉取全是快进。

**B. 本地首推（一次性）**

```powershell
git push cnb main        # 普通 push，不是 --force
```

`cnb` remote 已配好：`https://cnb.cool/zhileyo/dsh-fairy-next.git`。推到空仓
等价于把 GitHub 的提交原样放进来，同样是快进基线。

两种方式结果一样，之后都不再需要往 CNB 推送。

### 4. 打开自动触发并手动跑一次

`zhileyo/dsh-fairy-next` → **设置 → 云原生构建**：

- 勾选 **允许自动触发**（定时任务才跑得起来）；
- 若根组织把「允许定时任务自动触发」关掉了，要组织管理员放开。

然后去 **流水线 → 触发构建** 点 `mirror-from-github-manual`（`web_trigger`），
确认拉取流水线本身是通的。

若「定时任务」列表里没有每小时那条：随便改一次 `.cnb.yml`（加个空行）并 push，
让 CNB 重新解析配置。

### 5. 验证

```powershell
git ls-remote origin main    # GitHub
git ls-remote cnb main       # CNB
```

两个 SHA 必须一致；之后每小时拉取一次，跑完仍然一致。

### 6. 收尾

- 密钥仓库 `one-mugen/secrets`：pull 模式读公开仓库不需要凭据，
  `GITHUB_USERNAME` / `GITHUB_TOKEN` 已无人引用，留着无害。
- 旧 CNB 仓库删除后，本仓库的讨论/PR 等历史一并消失；需要留档就先导出。

## 日常流程

```powershell
git push origin main       # origin = GitHub，真源
```

CNB 会在下一个整点跟上；想立刻同步就在 CNB 页面手动触发一次
`mirror-from-github-manual`。**不要在 CNB 侧提交**：那里的改动会在下次
拉取时被覆盖（pull 是强制镜像）。

## 若真源改回私有

1. 在 CNB 密钥仓库里加 `GIT_USERNAME` / `GIT_ACCESS_TOKEN`
   （fine-grained token，Contents: Read-only 即可）；
2. 在 `.cnb.yml` 的两个 job 里恢复 `imports:` 与 `username` / `password` 两行。

## 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| 定时任务不跑 | 仓库或组织的「允许自动触发 / 允许定时任务自动触发」没开；或 `.cnb.yml` 没被解析（改一次文件重新 push） |
| 流水线成功但 CNB 没变 | git-sync 的 `target_url` 写错、或目标分支不是 `main`；看流水线日志里 `git fetch` 的输出 |
| 拉取报非快进 | CNB 侧有 GitHub 没有的提交（在网页上改过文件、或导入前做过初始化）；删掉那条提交重建基线 |
| 两边 SHA 不一致 | 有人往 CNB 侧提交过，或拉取失败；手动触发一次拉取即可回到一致 |
| `git push origin` 被拒绝 | 说明本地落后于 GitHub；先 `git pull --rebase` |

## 故意没改的标识符

这些名字看着像“项目旧名”，但它们是**运行时契约**，改了会破坏已安装用户的
配置/存储/样式，所以保持原样：

- 宿主路由前缀 `/dsh-fairy/*`（设置页、人设、诊断接口）
- `localStorage` 键 `dsh-fairy:*`、`dsh.fairyVoice.*`
- CSS 类 `dsh-hdd-*` / `.dsh-fairy-*`、`data-dsh-fairy-*` 标记
- `$DSH_HOME` 下的 `fairy-*` 目录

改的只有面向人的名字：仓库名、README 标题、npm 包 `homepage` /
`repository` / `bugs`、`NOTICE`、以及 `tools/prepare-publish.mjs` 里的
`REPO_URL` 与 `author`。
