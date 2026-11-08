/**
 * 统一的 npm 调用入口：pack-all 与 publish-npm 都要跑 npm，而“怎么跑 npm”在
 * 本机的坑比想象中多，所以只在这里写一遍。
 *
 * Windows 上 npm 是个 `.cmd`，而 Node 22 起不允许直接 spawn 批处理文件
 * （EINVAL）；加 `shell: true` 能跑但会触发 DEP0190「参数未转义」的弃用警告。
 * 于是优先顺着 PATH 找到 `npm.cmd` 旁边的 `node_modules/npm/bin/npm-cli.js`，
 * 用当前 node 去跑它——完全不用 shell。
 *
 * npm 的日志默认写进用户级 cache，受限环境里那目录可能不可写，真正的报错会被
 * 「日志写不进去」盖掉；所以 cache 一律指到仓库内的 `.dsh-market-home` 下。
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

/** 仓库根：tools/ 的上一级。 */
export const repoRoot = resolve(here, '..')

/** 工作目录（已 gitignore）：cache、tarball、安装测试都放这里。 */
const scratchRoot = join(repoRoot, '.dsh-market-home')

export function resolveNpm() {
	if (process.env.npm_execpath?.endsWith('.js')) {
		return { command: process.execPath, prefix: [process.env.npm_execpath], shell: false }
	}
	if (process.platform === 'win32') {
		const delimiter = ';'
		for (const dir of (process.env.PATH ?? '').split(delimiter)) {
			const cli = join(dir.replace(/^"|"$/g, ''), 'node_modules', 'npm', 'bin', 'npm-cli.js')
			if (existsSync(cli)) return { command: process.execPath, prefix: [cli], shell: false }
		}
		return { command: 'npm.cmd', prefix: [], shell: true }
	}
	return { command: 'npm', prefix: [], shell: false }
}

export function npmEnv(extra = {}) {
	return {
		...process.env,
		npm_config_cache: join(scratchRoot, '.npm-cache'),
		npm_config_update_notifier: 'false',
		npm_config_audit: 'false',
		npm_config_fund: 'false',
		npm_config_loglevel: 'error',
		...extra,
	}
}

/**
 * 跑一条 npm 命令并返回 stdout。失败时抛出带 stderr 尾部的错误。
 *
 * `passthrough: true` 让 npm 直接写继承来的 stdout/stderr —— 发布时想看
 * `+ pkg@version` 的实时输出，也会把 `npm publish` 的进度写进 CI 日志。
 */
export function runNpm(args, { cwd = repoRoot, env = {}, passthrough = false } = {}) {
	const npm = resolveNpm()
	try {
		return execFileSync(npm.command, [...npm.prefix, ...args], {
			cwd,
			encoding: 'utf8',
			shell: npm.shell,
			stdio: passthrough ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'pipe', 'pipe'],
			env: npmEnv(env),
		})
	} catch (error) {
		const stderr = String(error.stderr ?? '').trim()
		const tail = stderr.split('\n').slice(-3).join(' ')
		const failure = new Error(tail || error.message)
		failure.stdout = String(error.stdout ?? '')
		failure.stderr = stderr
		throw failure
	}
}
