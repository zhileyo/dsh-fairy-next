#!/usr/bin/env node
/**
 * 本地打包：把 workspace 里可发布的包按依赖顺序打成 tarball，默认落到
 * `.dsh-market-home/pkgs`（就是 DSH 市场装包时用的那个目录形态）。
 *
 * 存在的理由：发布前想在本机看到**真实产物**——每个包到底带了哪些文件、多大、
 * 以及锚包声明的版本范围是否覆盖得住这次打出来的包。这些都只有 pack 完才知道，
 * `npm publish --dry-run` 要跑在 CI 里，反馈太慢。
 *
 *   node tools/pack-all.mjs [--out <dir>] [--keep] [--install-test] [--json]
 *
 *   --out <dir>     改输出目录（相对仓库根，或绝对路径）
 *   --keep          不清理输出目录（默认先删，避免旧 tarball 混进安装目录）
 *   --install-test  打完之后把 tarball 装进临时目录，验证装上去的版本与 exports
 *   --json          把 pack-manifest.json 打到 stdout（CI 用），不打表格
 *
 * 产物里总有一份 `pack-manifest.json`：本次打出来的包、版本、tarball 路径与依赖
 * 范围。发布脚本按这份清单发，不再回到目录里重读 manifest。
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runNpm } from './npm-cli.mjs'

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

if (!keep) await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })

const problems = []
const rows = []
const records = []

// 单 tarball 分发：锚包用 `bundleDependencies` 把六个子包内联进自己的 tarball，
// 这样用户只装一个包、市场里只有一条记录，而子包依然是各自独立的 DSH 插件
// （宿主 app-boot 的 dependencyClosure 会从 bundle 目录出发解析依赖闭包，
// 所以花名册按包名仍能找到内联在 node_modules 里的真身）。
//
// npm 只内联「pack 那一刻真的躺在包目录 node_modules 里」的包，所以先按已打好的
// tarball 文件清单把子包复制进去，pack 完再删。用文件清单而不是整目录复制，是为了
// 让内联副本与线上独立发布的副本是同一批文件（src、test、docs 不会混进来）。
const packedFiles = new Map()
const bundledNames = (manifest) => [...(manifest.bundleDependencies ?? manifest.bundledDependencies ?? [])]

const stageBundled = async (anchor, deps, stagedRoot) => {
	await rm(stagedRoot, { recursive: true, force: true })
	for (const dep of deps) {
		const source = packedFiles.get(dep)
		if (source === undefined) {
			problems.push(`${anchor}: bundleDependencies 里的 ${dep} 还没打成 tarball`)
			continue
		}
		for (const file of source.files) {
			const to = join(stagedRoot, dep, file)
			await mkdir(dirname(to), { recursive: true })
			await copyFile(join(repo, 'packages', source.dir, file), to)
		}
	}
}

for (const pkg of ordered) {
	const { name, version } = pkg.manifest
	const bundled = bundledNames(pkg.manifest)
	const stagedRoot = join(repo, 'packages', pkg.dir, 'node_modules')
	if (bundled.length > 0) {
		for (const dep of bundled) {
			if (!Object.hasOwn(pkg.manifest.dependencies ?? {}, dep) && !Object.hasOwn(pkg.manifest.optionalDependencies ?? {}, dep)) {
				problems.push(`${name}: bundleDependencies 里的 ${dep} 没写进 dependencies`)
			}
		}
		await stageBundled(name, bundled, stagedRoot)
	}

	let info
	try {
		const stdout = runNpm(['pack', join(repo, 'packages', pkg.dir), '--pack-destination', outDir, '--json'])
		;[info] = JSON.parse(stdout)
	} catch (error) {
		problems.push(`${name}@${version}: npm pack 失败 —— ${error.message}`)
		rows.push({ label: `${name}@${version}`, size: '-', files: '-', deps: 'pack failed' })
		continue
	} finally {
		if (bundled.length > 0) await rm(stagedRoot, { recursive: true, force: true })
	}

	const paths = info.files.map((file) => file.path)
	packedFiles.set(name, { dir: pkg.dir, files: paths })

	// 声明了内联就必须真的内联：漏了的话装上去只剩一个空壳锚包。
	for (const dep of bundled) {
		if (!paths.some((path) => path.startsWith(`node_modules/${dep}/`))) {
			problems.push(`${name}@${version}: bundleDependencies 里的 ${dep} 没被打进 tarball`)
		}
	}
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
	records.push({
		name,
		version,
		file: join(outDir, info.filename),
		size: info.size,
		files: paths.length,
		dependencies: pkg.manifest.dependencies ?? {},
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
		// --legacy-peer-deps：唯一的 peer 是宿主提供的 @deepseek-ai/cordis，不该由这次测试装。
		// --offline：七个包之间只有 workspace 依赖，所以整条安装链不该碰 registry；
		// 一旦有人给某个包加了第三方依赖，这一步会直接失败（而不是在用户机器上失败）。
		runNpm(
			['install', '--no-audit', '--no-fund', '--ignore-scripts', '--legacy-peer-deps', '--offline', ...tarballs],
			{ cwd: scratch },
		)
	} catch (error) {
		installed = false
		problems.push(`install test 失败（--offline 下装不上，说明有包引入了第三方依赖）—— ${error.message}`)
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
		// 内联包必须能从锚包里按名字解析出来：宿主 app-boot 就是从 bundle 目录出发
		// 解析依赖闭包，再按花名册里的包名去查。
		const anchor = ordered.find((pkg) => bundledNames(pkg.manifest).length > 0)
		if (anchor !== undefined) {
			const anchorDir = join(scratch, 'node_modules', anchor.manifest.name)
			if (existsSync(anchorDir)) {
				const requireFromAnchor = createRequire(join(anchorDir, 'lib', 'index.js'))
				for (const dep of bundledNames(anchor.manifest)) {
					try {
						requireFromAnchor.resolve(dep)
					} catch {
						problems.push(`install test: 从锚包解析不到内联的 ${dep}`)
					}
				}
			}
		}

		const topLevel = (await readdir(join(scratch, 'node_modules'))).filter((entry) => !entry.startsWith('.') && !entry.startsWith('@'))
		if (topLevel.length !== ordered.length) {
			const extra = topLevel.filter((entry) => !byName.has(entry))
			problems.push(`install test: 装进来的第三方依赖不为空（${extra.join(', ') || '数量不符'}）—— 单包分发不再自足`)
		}
		installSummary = `install test: ${ordered.length} package(s) installed offline, 0 transitive dep(s) → ${scratch}`
	}
}

// ------------------------------------------------------------------ manifest

// CI 只信 tarball。这份清单记录「这次打出来的确切产物」，发布脚本按它逐条发，
// 不再回到目录里重读 package.json —— 否则本机验过的那批文件和线上一发的可能
// 不是同一批。顺序就是依赖顺序：被依赖的在前，锚包最后。
const manifest = {
	schema: 1,
	generatedAt: new Date().toISOString(),
	outDir,
	packages: records,
}
const manifestPath = join(outDir, 'pack-manifest.json')
await writeFile(manifestPath, `${JSON.stringify(manifest, null, '\t')}\n`)

// -------------------------------------------------------------------- report

if (argv.includes('--json')) {
	console.log(JSON.stringify(manifest))
} else {
	const width = Math.max(...rows.map((row) => row.label.length), 7)
	const pad = (text, size) => text.padEnd(size, ' ')
	console.log(`${pad('package', width)}  ${pad('size', 9)}  ${pad('files', 5)}  deps`)
	for (const row of rows) {
		console.log(`${pad(row.label, width)}  ${pad(row.size, 9)}  ${pad(row.files, 5)}  ${row.deps}`)
	}

	const totalKb = rows.reduce((sum, row) => sum + (Number.parseFloat(row.size) || 0), 0)
	console.log(`\n${rows.length} package(s), ${totalKb.toFixed(1)} kB total → ${outDir}`)
	console.log(`manifest: ${manifestPath}`)
	if (installSummary) console.log(installSummary)
}


if (problems.length > 0) {
	console.error(`\n${problems.length} problem(s):`)
	for (const problem of problems) console.error(`  - ${problem}`)
	process.exit(1)
}
