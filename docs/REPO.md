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

## 一次性迁移清单

下面这些操作需要 CNB/GitHub 的网页权限，脚本无法代劳。按顺序做一遍即可。

### 1. GitHub 仓库改名

<https://github.com/zhileyo/dsh-fairy> → **Settings → Repository name** 改成
`dsh-fairy-next`，点 Rename。

GitHub 会保留旧名字的重定向，所以外部旧链接（`AlwaysFyo/dsh-fairy`、
`zhileyo/dsh-fairy`）都还能打开。仓库保持 **Public**——私有会让 CNB 的
pull 流水线需要额外凭据（见文末）。

### 2. 本地 remote 换向

```powershell
git remote set-url origin https://github.com/zhileyo/dsh-fairy-next.git
git remote remove github          # 旧的只读镜像 remote，已无用途
git remote add cnb https://cnb.cool/zhileyo/dsh-fairy-next.git   # 仅一次性对齐用
```

### 3. 把本地推上 GitHub

```powershell
git push origin main
```

### 4. 在 CNB 上建好 `zhileyo/dsh-fairy-next`

CNB 控制台里二选一：

- **转移仓库**（如果仓库设置里有这个入口）：把 `one-mugen/dsh-fairy` 转进
  `zhileyo` 命名空间并改名 `dsh-fairy-next`，历史会一起带过去；
- **新建空仓库**：在 `zhileyo` 下新建 `dsh-fairy-next`（不要勾选初始化
  README / .gitignore，保持空仓）。

两种方式之后都需要第 5 步把历史**强制对齐**到 GitHub。

### 5. 强制对齐 CNB 历史（一次性）

旧 CNB 历史里有 `.cnb.yml` 的 filter-branch 提交，与 GitHub 历史不同源，
所以这次推送必然是非快进：

```powershell
git fetch origin main
git push cnb --force main
```

- 若 CNB 的 `main` 是保护分支，先在 **设置 → 分支保护** 里临时放开
  「禁止强制推送」，推完再打开。
- 要确保没有遗留分支/标签也一起对齐，可以用
  `git push cnb --force --mirror`（会删除 CNB 上 GitHub 没有的 ref，
  确认无遗留工作后再用）。

推完 `git ls-remote` 两边对比，`main` 的 SHA 必须一致：

```powershell
git ls-remote origin main
git ls-remote cnb main
```

### 6. 打开 CNB 的自动触发

`zhileyo/dsh-fairy-next` → **设置 → 云原生构建**：

- 勾选 **允许自动触发**（push / 定时任务等事件才会跑流水线）；
- 若根组织层把「允许定时任务自动触发」关掉了，需要组织管理员放开，否则
  每小时的拉取不会执行。

首次 push `.cnb.yml` 之后，定时任务才会被解析注册；可以先去
**流水线 → 触发构建**（`web_trigger`）手动跑一次验证。

### 7. 收尾

- 旧仓库 `one-mugen/dsh-fairy`：确认不再需要后归档/删除，避免有人往那边推。
- 密钥仓库 `one-mugen/secrets`：pull 模式读公开仓库不需要凭据，
  `GITHUB_USERNAME` / `GITHUB_TOKEN` 已经不再被引用。
- 本仓库的 `.cnb.yml` 不再 `imports` 任何密钥文件。

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
| 定时任务不跑 | 仓库或组织的「允许自动触发 / 允许定时任务自动触发」没开；或 `.cnb.yml` 尚未随 push 被解析 |
| 流水线成功但 CNB 没变 | git-sync 的 `target_url` 写错、或目标分支不是 `main`；看流水线日志里 `git fetch` 的输出 |
| 两边 SHA 不一致 | 有人往 CNB 侧提交过，或拉取失败；手动触发一次拉取即可回到一致 |
| push 被拒绝（非快进） | 说明本地落后于 GitHub；先 `git pull --rebase` |

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
