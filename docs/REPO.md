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
  truth and CNB a pull mirror`）；它的 SHA 就是 CNB 要对齐的目标，
  用 `git ls-remote origin main` 现取即可，别照抄文档。

CNB 侧还剩三步，都需要控制台/仓库写权限，脚本代劳不了。

### 1. 在 CNB 把仓库改名

`zhileyo/dsh-fairy` → **设置 → 仓库名 / 路径** 改成 `dsh-fairy-next`。

CNB 的旧路径 `one-mugen/dsh-fairy` 现在仍然解析到同一个仓库（实测两个地址
`git ls-remote` 返回同一个 head），改名后同理会有重定向，外部旧链接不会断。

### 2. 强制对齐 CNB 历史（一次性）

CNB 当前 head 是 `2aca0e6`——旧方案（CNB 推 GitHub）的历史，里面有
`filter-branch` 摘 `.cnb.yml` 的提交，与 GitHub 的新历史不同源，所以这次
推送必然是非快进：

```powershell
git fetch origin main
git push cnb --force main
```

- `cnb` remote 已在本地配好：`https://cnb.cool/zhileyo/dsh-fairy-next.git`
  （CNB 改名之前它指向 `zhileyo/dsh-fairy.git`，先确认地址再推）。
- 若 `main` 是 CNB 的保护分支，先在 **设置 → 分支保护** 里临时放开
  「禁止强制推送」，推完再打开。
- 只对齐 main、不碰其它分支/标签就保留上面的 `--force main`；要整体镜像用
  `git push cnb --force --mirror`（会删除 CNB 上 GitHub 没有的 ref）。

对齐后两边必须同 SHA：

```powershell
git ls-remote origin main    # GitHub
git ls-remote cnb main       # CNB
```

### 3. 打开 CNB 自动触发

`zhileyo/dsh-fairy-next` → **设置 → 云原生构建**：

- 勾选 **允许自动触发**（定时任务才跑得起来）；
- 若根组织把「允许定时任务自动触发」关掉了，要组织管理员放开。

定时任务要等 `.cnb.yml` 随一次 push 被解析后才注册。之后去
**流水线 → 触发构建** 点 `mirror-from-github-manual` 手动跑一次，
确认拉取流水线本身是通的。

### 4. 收尾

- 密钥仓库 `one-mugen/secrets`：pull 模式读公开仓库不需要凭据，
  `GITHUB_USERNAME` / `GITHUB_TOKEN` 已无人引用，留着无害。
- 旧地址 `one-mugen/dsh-fairy` 会重定向到改名后的仓库，不必单独处理。

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
