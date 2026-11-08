#!/usr/bin/env node
/**
 * 本地打包：把 workspace 里可发布的包按依赖顺序打成 tarball，默认落到
 * `.dsh-market-home/pkgs`（就是 DSH 市场装包时用的那个目录形态）。
 *
 * 存在的理由：发布前想在本机看到**真实产物**——每个包到底带了哪些文件、多大、
 * 以及锚包声明的版本范围是否覆盖得住这次打出来的包。这些都只有 pack 完才知道，
 * `npm publish --dry-run` 要跑在 CI 里，反馈太慢。
 *
 *   node tools/pack-all.mjs [--out <dir>] [--keep] [--install-test]
 *
 *   --out <dir>     改输出目录（相对仓库根，或绝对路径）
 *   --keep          不清理输出目录（默认先删，避免旧 tarball 混进安装目录）
 *   --install-test  打完之后把 tarball 装进临时目录，验证装上去的版本与 exports
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')

const argv = process.argv.slice(2)
const outFlag = argv.indexOf('--out')
const keep = argv.includes('--keep')
const outDir = outFlag >= 0 && argv[outFlag + 1]
	? (isAbsolute(argv[outFlag + 1]) ? argv[outFlag + 1] : resolve(repo, argv[outFlag + 1]))
	: join(repo, '.dsh-market-home', 'pkgs')

// ---------------------------------------------------------------- manifests

const packages = []
for (const entry of await readdir(join(repo, 'packages'), { withFileTypes: true })) {
	if (!entry.isDirectory()) continue
	const manifestPath = join(repo, 'packages', entry.name, 'package.json')
	if (!existsSync(manifestPath)) continue
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
	if (manifest.private) continue
	packages.push({ dir: entry.name, manifest })
}
if (packages.length === 0) throw new Error('packages/ 下没有可发布的包')

const byName = new Map(packages.map((pkg) => [pkg.manifest.name, pkg]))

// 依赖在前、被依赖的在后：锚包最后，安装时它声明的子包都已经在目录里。
const ordered = []
const state = new Map()
const visit = (pkg, chain) => {
	const mark = state.get(pkg.manifest.name)
	if (mark === 'done') return
	if (mark === 'visiting') throw new Error(`workspace 内部存在循环依赖：${[...chain, pkg.manifest.name].join(' -> ')}`)
	state.set(pkg.manifest.name, 'visiting')
	for (const dep of Object.keys(pkg.manifest.dependencies ?? {})) {
		const target = byName.get(dep)
		if (target) visit(target, [...chain, pkg.manifest.name])
	}
	state.set(pkg.manifest.name, 'done')
	ordered.push(pkg)
}
for (const pkg of packages) visit(pkg, [])

// ------------------------------------------------------------ version range

const parseVersion = (text) => {
	const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(text).trim())
	if (!match) return null
	return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

const compare = (a, b) => a.major - b.major || a.minor - b.minor || a.patch - b.patch

/** 只认仓库里实际会出现的这几种范围；返回 null 表示语法不认识（不判错，只提示）。 */
const satisfies = (versionText, rangeText) => {
	const range = String(rangeText).trim()
	if (range === '' || range === '*' || range === 'latest') return true
	const version = parseVersion(versionText)
	if (!version) return null

	let match = /^\^(\d+)\.(\d+)\.(\d+)/.exec(range)
	if (match) {
		const floor = { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
		if (compare(version, floor) < 0) return false
		if (floor.major > 0) return version.major === floor.major
		if (floor.minor > 0) return version.major === 0 && version.minor === floor.minor
		return version.major === 0 && version.minor === 0 && version.patch === floor.patch
	}

	match = /^~(\d+)\.(\d+)\.(\d+)/.exec(range)
	if (match) {
		const floor = { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
		return version.major === floor.major && version.minor === floor.minor && version.patch >= floor.patch
	}

	match = /^(\d+)\.(\d+)\.(\d+)$/.exec(range)
	if (match) return compare(version, { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }) === 0

	return null
}

// --------------------------------------------------------------------- pack

// 找到可以直接 exec 的 npm 入口。Windows 上 npm 是 .cmd，而 Node 22 起不再允许
// 直接 spawn 批处理文件（EINVAL），所以优先顺着 PATH 找到 npm.cmd 旁边的
// node_modules/npm/bin/npm-cli.js，用当前的 node 去跑它——这样也不用 shell，
// 省掉 DEP0190 那条“参数未转义”的弃用警告。
const delimiter = process.platform === 'win32' ? ';' : ':'
const pickNpm = () => {
	if (process.env.npm_execpath?.endsWith('.js')) {
		return { command: process.execPath, prefix: [process.env.npm_execpath], shell: false }
	}
	if (process.platform === 'win32') {
		for (const dir of (process.env.PATH ?? '').split(delimiter)) {
			const cli = join(dir.replace(/^"|"$/g, ''), 'node_modules', 'npm', 'bin', 'npm-cli.js')
			if (existsSync(cli)) return { command: process.execPath, prefix: [cli], shell: false }
		}
		return { command: 'npm.cmd', prefix: [], shell: true }
	}
	return { command: 'npm', prefix: [], shell: false }
}
const npm = pickNpm()
if (!keep) await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

// npm 会把日志写进 cache 目录；用户级 cache 在受限沙箱里可能不可写，
// 于是真正的报错被“日志写不进去”盖掉。统一指到仓库内，跟 tarball 放一起。
const cacheDir = join(dirname(outDir), '.npm-cache')
const npmEnv = {
	...process.env,
	npm_config_cache: cacheDir,
	npm_config_update_notifier: 'false',
	npm_config_audit: 'false',
	npm_config_fund: 'false',
	npm_config_loglevel: 'error',
}

const problems = []
const rows = []

for (const pkg of ordered) {
	const { name, version } = pkg.manifest

	let info
	try {
		const stdout = execFileSync(
			npm.command,
			[...npm.prefix, 'pack', join(repo, 'packages', pkg.dir), '--pack-destination', outDir, '--json'],
			{
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
				shell: npm.shell,
				env: npmEnv,
			},
		)
		;[info] = JSON.parse(stdout)
	} catch (error) {
		const detail = String(error.stderr ?? error.message).trim().split('\n').slice(-3).join(' ')
		problems.push(`${name}@${version}: npm pack 失败 —— ${detail}`)
		rows.push({ label: `${name}@${version}`, size: '-', files: '-', deps: 'pack failed' })
		continue
	}

	const paths = info.files.map((file) => file.path)
	const expectName = `${name}-${version}.tgz`
	if (info.filename !== expectName) problems.push(`${name}@${version}: tarball 名叫 ${info.filename}，期望 ${expectName}`)

	// 每个包都必须自带 LICENSE：npm 只从包目录里取，不会往上找仓库根的。
	if (!paths.includes('LICENSE')) problems.push(`${name}@${version}: tarball 里没有 LICENSE`)

	// `files` 里写了的顶层条目必须真的进了包，否则装上去会缺东西。
	for (const entry of pkg.manifest.files ?? []) {
		const clean = entry.replace(/^\.\//, '').replace(/\/$/, '')
		if (!paths.some((path) => path === clean || path.startsWith(`${clean}/`))) {
			problems.push(`${name}@${version}: files 里的 ${entry} 没被打进包`)
		}
	}

	// main 与 exports 是另外维护的字段，最容易和 files 脱节：指向的文件必须在包里。
	const targets = [pkg.manifest.main, ...Object.values(pkg.manifest.exports ?? {}).filter((value) => typeof value === 'string')]
	for (const entry of new Set(targets.filter(Boolean))) {
		const clean = String(entry).replace(/^\.\//, '')
		if (!paths.includes(clean)) problems.push(`${name}@${version}: main/exports 指向的 ${entry} 不在包里`)
	}

	const rangeNotes = []
	for (const [dep, range] of Object.entries(pkg.manifest.dependencies ?? {})) {
		const target = byName.get(dep)
		if (!target) continue
		const ok = satisfies(target.manifest.version, range)
		if (ok === false) problems.push(`${name}@${version}: 依赖 ${dep}@${target.manifest.version} 不满足 ${range}`)
		if (ok === null) rangeNotes.push(`${dep} ${range} 语法未校验`)
	}

	rows.push({
		label: `${name}@${version}`,
		size: `${(info.size / 1024).toFixed(1)} kB`,
		files: String(paths.length),
		deps: rangeNotes.length > 0 ? rangeNotes.join('; ') : 'ok',
	})
}

// -------------------------------------------------------------- install test

// 打包结果的最终判据是“装上去能不能用”。这里把七个 tarball 真装进一个临时目录，
// 再看 node_modules 里的版本与 exports 是否对得上 tarball 里写的东西。
let installSummary = null
if (argv.includes('--install-test')) {
	const scratch = join(dirname(outDir), 'install-test')
	await rm(scratch, { recursive: true, force: true })
	await mkdir(scratch, { recursive: true })
	await writeFile(join(scratch, 'package.json'), `${JSON.stringify({ name: 'pack-install-test', private: true }, null, '\t')}\n`)

	const tarballs = ordered.map((pkg) => join(outDir, `${pkg.manifest.name}-${pkg.manifest.version}.tgz`))
	let installed = true
	try {
		// --legacy-peer-deps：唯一的 peer 是宿主提供的 @deepseek-ai/cordis，不该由这次测试装；
		// voice 的三个 mdast 依赖是普通依赖，所以这一步确实要能访问 registry。
		execFileSync(
			npm.command,
			[...npm.prefix, 'install', '--no-audit', '--no-fund', '--ignore-scripts', '--legacy-peer-deps', ...tarballs],
			{ cwd: scratch, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: npm.shell, env: npmEnv },
		)
	} catch (error) {
		installed = false
		const detail = String(error.stderr ?? error.message).trim().split('\n').slice(-3).join(' ')
		problems.push(`install test 失败（这一步要联网解析 voice 的 mdast 依赖）—— ${detail}`)
	}

	if (installed) {
		for (const pkg of ordered) {
			const { name, version } = pkg.manifest
			const dir = join(scratch, 'node_modules', name)
			if (!existsSync(dir)) {
				problems.push(`install test: ${name} 没出现在 node_modules 里`)
				continue
			}
			const manifest = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
			if (manifest.version !== version) problems.push(`install test: ${name} 装成了 ${manifest.version}，期望 ${version}`)
			const targets = [manifest.main, ...Object.values(manifest.exports ?? {}).filter((value) => typeof value === 'string')]
			for (const entry of new Set(targets.filter(Boolean))) {
				const clean = String(entry).replace(/^\.\//, '')
				if (!existsSync(join(dir, clean))) problems.push(`install test: ${name} 的 ${entry} 装上后不存在`)
			}
		}
		const extra = (await readdir(join(scratch, 'node_modules'))).filter((entry) => !entry.startsWith('.') && !entry.startsWith('@')).length
		installSummary = `install test: ${ordered.length} package(s) + ${extra - ordered.length} transitive dep(s) installed → ${scratch}`
	}
}

// -------------------------------------------------------------------- report

const width = Math.max(...rows.map((row) => row.label.length), 7)
const pad = (text, size) => text.padEnd(size, ' ')
console.log(`${pad('package', width)}  ${pad('size', 9)}  ${pad('files', 5)}  deps`)
for (const row of rows) {
	console.log(`${pad(row.label, width)}  ${pad(row.size, 9)}  ${pad(row.files, 5)}  ${row.deps}`)
}

const totalKb = rows.reduce((sum, row) => sum + (Number.parseFloat(row.size) || 0), 0)
console.log(`\n${rows.length} package(s), ${totalKb.toFixed(1)} kB total → ${outDir}`)
if (installSummary) console.log(installSummary)

if (problems.length > 0) {
	console.error(`\n${problems.length} problem(s):`)
	for (const problem of problems) console.error(`  - ${problem}`)
	process.exit(1)
}
