#!/usr/bin/env node
/**
 * 给七个包一次性配好 Trusted Publisher（GitHub Actions + OIDC）。
 *
 * 配好之后 `npm publish` 靠工作流自己的 OIDC 身份换短时令牌，仓库里不需要
 * 任何 `NPM_TOKEN`。七个包是独立的名字，npm 的关系也是逐包登记的，所以这里
 * 循环七次——手工在网页上点七遍容易漏一个，而漏掉的那个包会在发布时以
 * `ENEEDAUTH` 失败，看起来像是整个工作流坏了。
 *
 * 包还没发布也能配：npm 允许先建关系，首次发布时校验并把它绑定到仓库的
 * 不可变身份上。注意首次发布要在 2 天内完成，否则这条配置过期作废。
 *
 *   node tools/trust-publisher.mjs              # 七个包都配
 *   node tools/trust-publisher.mjs --check      # 只看现有配置
 *
 * **本仓库的账号用不了这条路**：账号开了 2FA（`auth-and-writes`），而
 * `npm trust` 的创建路径（github.js / gitlab.js / circleci.js）没有 `otplease`，
 * 不会送 OTP；`create` 与 `list` 于是都返回 403。改用绕过 2FA 的 granular token
 * 也不行——registry 的原话是
 * `Granular access tokens that bypass two-factor authentication may not perform this action`
 * （https://gh.io/npm-gat-bypass2fa-deprecation）。所以这里的七个关系只能在
 * npmjs.com 的包设置页里点，每个包一次：
 *   包页 → Settings → Trusted Publisher → GitHub Actions
 *   Repository: zhileyo/dsh-fairy-next
 *   Workflow filename: publish-npm.yml
 *   勾上允许 `npm publish`
 * 这个脚本留给没有 2FA 的账号，或者等 npm 把 OTP 补进创建路径之后再回来用。
 *
 * 没有 `--dry-run`：npm 的 dry-run 连请求都不发、也不查登录状态，会一律报
 * 成功，看起来像配好了其实什么都没写。要预览就用 `--check`。
 *
 * 需要先 `npm login --auth-type=web`（配关系要 npm 账号的写权限）。
 */
import { readdirSync, existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { repoRoot, runNpm } from './npm-cli.mjs'

const ANCHOR = 'dsh-fairy-next'
const USAGE = `用法: node tools/trust-publisher.mjs [--check]
       [--repo <owner/repo>] [--file <workflow.yml>] [--pkg <name>...]

  --check   只列出每个包当前的 Trusted Publisher，不改任何东西
  --repo    仓库，默认从锚包的 repository.url 推出来
  --file    工作流文件名，默认 publish-npm.yml
  --pkg     只处理指定的包（可重复）`

function parseArgs(argv) {
	const options = { check: false, repo: null, file: 'publish-npm.yml', only: [] }
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--help' || arg === '-h') {
			console.log(USAGE)
			process.exit(0)
		} else if (arg === '--check') {
			options.check = true
		} else if (arg === '--repo') {
			options.repo = argv[++i]
		} else if (arg === '--file') {
			options.file = argv[++i]
		} else if (arg === '--pkg') {
			options.only.push(argv[++i])
		} else {
			throw new Error(`不认识的参数: ${arg}\n\n${USAGE}`)
		}
	}
	if (!options.file.endsWith('.yml') && !options.file.endsWith('.yaml')) {
		throw new Error(`--file 要带 .yml 或 .yaml 后缀: ${options.file}`)
	}
	return options
}

/** 工作区的七个包；锚包放最后，读起来跟发布顺序一致。 */
function discoverPackages() {
	const dir = path.join(repoRoot, 'packages')
	const names = []
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue
		const manifest = path.join(dir, entry.name, 'package.json')
		if (!existsSync(manifest)) continue
		const { name } = JSON.parse(readFileSync(manifest, 'utf8'))
		if (typeof name === 'string' && name.startsWith('dsh-fairy-next')) names.push(name)
	}
	return names.sort((a, b) => (a === ANCHOR) - (b === ANCHOR) || a.localeCompare(b))
}

/** 从锚包的 repository.url 推 `owner/repo`，省得再手写一遍仓库名。 */
function defaultRepo() {
	const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'packages', ANCHOR, 'package.json'), 'utf8'))
	const url = String(manifest.repository?.url ?? '')
	const match = url.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/)
	if (!match) throw new Error(`锚包的 repository.url 不是 GitHub 地址，请用 --repo 指定: ${url}`)
	return `${match[1]}/${match[2]}`
}

function trust(args) {
	return runNpm(['trust', ...args])
}

function main() {
	const options = parseArgs(process.argv.slice(2))
	const repo = options.repo ?? defaultRepo()
	const packages = discoverPackages().filter((name) => !options.only.length || options.only.includes(name))
	if (!packages.length) throw new Error('没有找到要处理的包')

	console.log(`repo:     ${repo}`)
	console.log(`workflow: ${options.file}`)
	console.log(`packages: ${packages.length}`)
	console.log(options.check ? 'mode:     只读检查' : 'mode:     写入')
	console.log('')

	let failed = 0
	let unauthenticated = false
	for (const name of packages) {
		const args = options.check
			? ['list', name]
			: [
					'github',
					name,
					'--file',
					options.file,
					'--repo',
					repo,
					// 没有这个权限位，npm 会拒绝创建关系（它也允许 --allow-stage-publish）
					'--allow-publish',
					'--yes',
				]
		try {
			const output = String(trust(args) ?? '').trim()
			const first = output.split('\n').find((line) => line.trim()) ?? ''
			console.log(`ok    ${name}${first && options.check ? `  ${first.trim()}` : ''}`)
			if (options.check && output) {
				for (const line of output.split('\n').slice(1)) console.log(`      ${line.trim()}`)
			}
		} catch (error) {
			failed++
			const text = `${error.message}\n${error.stderr ?? ''}`
			if (/ENEEDAUTH|E401|not authenticated|need auth/i.test(text)) unauthenticated = true
			console.log(`FAIL  ${name}: ${String(error.message).split('\n')[0]}`)
		}
	}

	console.log('')
	console.log(`${packages.length - failed}/${packages.length} 个包处理成功`)
	if (unauthenticated) {
		console.log('')
		console.log('没有登录 npm。先跑 `npm login --auth-type=web`，再重跑这条命令。')
	}
	if (failed) process.exit(1)
}

try {
	main()
} catch (error) {
	console.error(`trust-publisher: ${error.message}`)
	process.exit(1)
}
