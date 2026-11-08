#!/usr/bin/env node
/**
 * 发布 `pack-all` 打出来的 tarball。
 *
 * 为什么不按目录 `npm publish packages/xxx`：那是第二份实现。目录里有什么、files
 * 匹配到什么、manifest 被谁改过，都得重新算一遍；本机 `pack-all --install-test`
 * 验过的和线上一发的可能不是同一批字节。这里只认 `.dsh-market-home/pkgs/pack-manifest.json`
 * 里那份清单，发的是同一个 .tgz。
 *
 *   node tools/publish-npm.mjs [--dry-run] [--manifest <path>] [--tag <dist-tag>]
 *                              [--access public] [--no-provenance]
 *
 *   --dry-run        走完所有检查与 npm publish --dry-run，不真的上传
 *   --manifest <p>   指定清单（默认 .dsh-market-home/pkgs/pack-manifest.json）
 *   --tag <name>     dist-tag，默认 latest（预发布请用 next）
 *   --access public  默认 public
 *   --no-provenance  不加 --provenance（本地发布没有 OIDC 时用）
 *
 * 已存在的 `name@version` 会被跳过，所以重复触发是安全的；真正的失败以退出码 1
 * 结束，并把每一条都列出来。
 */
import { existsSync } from 'node:fs'
import { appendFile, readFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import { repoRoot, runNpm } from './npm-cli.mjs'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const value = (name, fallback) => {
	const index = argv.indexOf(name)
	return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
}

const dryRun = flag('--dry-run')
const access = value('--access', 'public')
const distTag = value('--tag', 'latest')
const provenance = !flag('--no-provenance') && !dryRun
const manifestFlag = value('--manifest', null)
const manifestPath = manifestFlag
	? (isAbsolute(manifestFlag) ? manifestFlag : resolve(repoRoot, manifestFlag))
	: join(repoRoot, '.dsh-market-home', 'pkgs', 'pack-manifest.json')

if (!existsSync(manifestPath)) {
	console.error(`publish-npm: 找不到 ${manifestPath}`)
	console.error('先跑 node tools/pack-all.mjs（它会写出这份清单）')
	process.exit(1)
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (manifest.schema !== 1 || !Array.isArray(manifest.packages) || manifest.packages.length === 0) {
	console.error(`publish-npm: ${manifestPath} 不是 pack-manifest v1，或者里面没有包`)
	process.exit(1)
}

const problems = []
const rows = []

/** registry 上已经有这个确切版本时返回 true；任何查询失败都当作「没有」。 */
const isPublished = (name, version) => {
	try {
		const stdout = runNpm(['view', `${name}@${version}`, 'version'])
		return stdout.trim() === version
	} catch {
		return false
	}
}

for (const pkg of manifest.packages) {
	const { name, version, file } = pkg
	const label = `${name}@${version}`

	if (!file || !existsSync(file)) {
		problems.push(`${label}: tarball 不存在（${file ?? '清单里没有 file 字段'}）`)
		rows.push({ label, result: 'missing tarball' })
		continue
	}

	if (isPublished(name, version)) {
		rows.push({ label, result: 'skipped, already on registry' })
		console.log(`${label} 已在 registry 上，跳过`)
		continue
	}

	const args = ['publish', file, '--access', access, '--tag', distTag]
	if (provenance) args.push('--provenance')
	if (dryRun) args.push('--dry-run')

	try {
		// passthrough：让 npm 自己的 `+ pkg@version` 进日志，失败原因也直接可见。
		runNpm(args, { passthrough: true })
		rows.push({ label, result: dryRun ? 'dry run ok' : 'published' })
	} catch (error) {
		problems.push(`${label}: npm publish 失败 —— ${error.message}`)
		rows.push({ label, result: 'failed' })
	}
}

const width = Math.max(...rows.map((row) => row.label.length), 7)
const summary = [
	`| package | result |`,
	`| --- | --- |`,
	...rows.map((row) => `| \`${row.label}\` | ${row.result} |`),
].join('\n')

console.log(`\n${dryRun ? 'dry run' : 'publish'} from ${manifestPath}`)
for (const row of rows) console.log(`${row.label.padEnd(width)}  ${row.result}`)

// CI 的结果页：把这张表贴到 step summary 上，省得翻日志。
if (process.env.GITHUB_STEP_SUMMARY) {
	try {
		await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
	} catch {
		// summary 写不进去不该让发布失败
	}
}

if (problems.length > 0) {
	console.error(`\n${problems.length} problem(s):`)
	for (const problem of problems) console.error(`  - ${problem}`)
	process.exit(1)
}
