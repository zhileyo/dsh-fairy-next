#!/usr/bin/env node
/**
 * Bump the version of every workspace package at once.
 *
 * The seven packages ship as one batch: the anchor declares caret ranges on the
 * other six, so a release is only coherent when all of them carry the same
 * number. Bumping them by hand is how those ranges drift apart and the market
 * ends up installing a mix of versions, so the range rewrite lives here.
 *
 * This writes manifests only. It does not install, publish or tag:
 *
 *   node tools/bump-version.mjs 0.2.0
 *   pnpm install --lockfile-only     # importers record the new specifiers
 *   git commit -am "chore: release 0.2.0"
 *   git tag v0.2.0 && git push origin main --tags
 *
 * `--dry` prints the diff without writing; `--force` allows a version that is
 * not greater than the current one (for correcting a wrong bump before it ever
 * reached the registry).
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGES_DIR = join(ROOT, 'packages')
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const DEP_FIELDS = ['dependencies', 'optionalDependencies']

function fail(message) {
  console.error(`bump-version: ${message}`)
  process.exit(1)
}

/** Parse the release arguments this repository actually uses: x.y.z or x.y.z-pre. */
function compare(left, right) {
  const parse = (value) => {
    const [core, pre = ''] = value.split('-', 2)
    return { core: core.split('.').map(Number), pre }
  }
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] - b.core[index]
  }
  // A prerelease sorts before its release: 0.2.0-rc.1 < 0.2.0.
  if (a.pre === b.pre) return 0
  if (a.pre === '') return 1
  if (b.pre === '') return -1
  return a.pre.localeCompare(b.pre)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const force = args.includes('--force')
const version = args.find((argument) => !argument.startsWith('--'))

if (!version) fail('usage: node tools/bump-version.mjs <x.y.z> [--dry] [--force]')
if (!SEMVER.test(version)) fail(`not a version this repository publishes: ${version}`)

/** Every package in the workspace, in directory order. */
function readPackages() {
  return readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(PACKAGES_DIR, entry.name))
    .filter((dir) => {
      try {
        return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name?.startsWith('dsh-fairy-next')
      } catch {
        return false
      }
    })
}

const dirs = readPackages()
if (dirs.length === 0) fail('no dsh-fairy-next packages found under packages/')

const manifests = new Map(
  dirs.map((dir) => {
    const path = join(dir, 'package.json')
    return [dir, { path, json: JSON.parse(readFileSync(path, 'utf8')) }]
  }),
)
const workspaceNames = new Set([...manifests.values()].map(({ json }) => json.name))
const current = [...manifests.values()].map(({ json }) => json.version)
const highest = current.sort(compare).at(-1)

if (!force && compare(version, highest) <= 0) {
  fail(
    `${version} is not newer than the current highest version ${highest}; pass --force to correct a bump that never shipped`,
  )
}

const rows = []
for (const { path, json } of manifests.values()) {
  const from = json.version
  json.version = version
  const rewritten = []
  for (const field of DEP_FIELDS) {
    for (const [name, range] of Object.entries(json[field] ?? {})) {
      if (!workspaceNames.has(name)) continue
      // `link:` and `workspace:` specifiers are development wiring; pin-versions
      // owns turning them into ranges at publish time.
      if (/^(link:|workspace:|file:)/.test(range)) continue
      const next = `^${version}`
      if (next === range) continue
      json[field][name] = next
      rewritten.push(`${name}@${range} -> ${next}`)
    }
  }
  rows.push({ name: json.name, from, to: version, rewritten })
}

const width = Math.max(...rows.map(({ name }) => name.length))
for (const { name, from, to, rewritten } of rows) {
  console.log(`${name.padEnd(width)}  ${from} -> ${to}`)
  for (const line of rewritten) console.log(`${''.padEnd(width)}  dep ${line}`)
}

if (dryRun) {
  console.log(`\ndry run: ${rows.length} manifest(s) would be written`)
  process.exit(0)
}

for (const { path, json } of manifests.values()) {
  writeFileSync(path, `${JSON.stringify(json, null, 2)}\n`)
}

console.log(`\n${rows.length} manifest(s) written. Next:`)
console.log('  pnpm install --lockfile-only')
console.log(`  git commit -am "chore: release ${version}"`)
console.log(`  git tag v${version} && git push origin main --tags`)
