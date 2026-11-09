import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

// 锚包是唯一的分发单位：它的 tarball 内联六个子包，用户只装一个名字。
// 这三条不变量决定了「装一个包 = 装齐整套插件」，任何一条被改坏都要等装完才发现。
const packagesUrl = new URL('../../', import.meta.url);

const manifests = new Map();
for (const entry of await readdir(packagesUrl, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    const manifest = JSON.parse(await readFile(new URL(`${entry.name}/package.json`, packagesUrl), 'utf8'));
    manifests.set(manifest.name, manifest);
  } catch {
    // packages/ 下的非包目录（比如残留的 node_modules）直接跳过。
  }
}

const anchor = manifests.get('dsh-fairy-next');
const bundled = [...(anchor.bundleDependencies ?? anchor.bundledDependencies ?? [])];
const workspaceDependencies = Object.keys(anchor.dependencies ?? {}).filter((name) => manifests.has(name));

test('bundles exactly the workspace packages it depends on', () => {
  assert.deepEqual([...bundled].sort(), [...workspaceDependencies].sort());
});

test('declares every bundled package as a dependency', () => {
  // npm 只内联 dependencies 里声明过的包；漏一个，那个子包就不会进 tarball。
  for (const name of bundled) {
    assert.ok(manifests.has(name), `${name} is bundled but not a workspace package`);
    assert.ok(Object.hasOwn(anchor.dependencies ?? {}, name), `${name} is bundled but not declared in dependencies`);
  }
});

test('needs nothing from the registry at runtime', () => {
  // 锚包的 tarball 内联六个子包，自己又只有 workspace 依赖 —— 于是「装一个包」
  // 不需要再从 registry 解析任何第三方包。这条不变量一旦破了，离线/弱网环境
  // 就会装不上，而本地（依赖早就在 node_modules 里）永远测不出来。
  for (const manifest of manifests.values()) {
    for (const dependency of Object.keys(manifest.dependencies ?? {})) {
      assert.ok(manifests.has(dependency), `${manifest.name} 依赖了套件外的 ${dependency}`);
    }
  }
});
