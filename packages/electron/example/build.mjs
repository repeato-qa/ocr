import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const outdir = path.join(rootDir, 'build')
const assetsDir = path.join(outdir, 'assets')
const wasmDir = path.join(outdir, 'wasm')
const workspaceRoot = path.join(rootDir, '../../..')
const localAlias = {
  "@gutenye/ocr-browser": path.join(workspaceRoot, "packages/browser/src/index.ts"),
  "@repeato/ocr": path.join(workspaceRoot, "packages/node/src/index.ts"),
  "@repeato/ocr/electron": path.join(workspaceRoot, "packages/node/src/electron.ts"),
  "@gutenye/ocr-common": path.join(workspaceRoot, "packages/common/src/index.ts"),
  "@gutenye/ocr-models/node": path.join(rootDir, "stubs/default-models.js"),
  "@gutenye/ocr-common/splitIntoLineImages": path.join(workspaceRoot, "packages/common/src/backend/splitIntoLineImages.ts"),
};
const rendererAlias = {
  ...localAlias,
  fs: path.join(rootDir, 'stubs/empty.js'),
  path: path.join(rootDir, 'stubs/empty.js'),
}

await fs.rm(outdir, { recursive: true, force: true })
await fs.mkdir(outdir, { recursive: true })

await Promise.all([
  build({
    entryPoints: [path.join(rootDir, 'main.ts')],
    outfile: path.join(outdir, 'main.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron', 'onnxruntime-node', 'sharp'],
    alias: localAlias,
    tsconfig: path.join(workspaceRoot, 'tsconfig.json'),
  }),
  build({
    entryPoints: [path.join(rootDir, 'preload.ts')],
    outfile: path.join(outdir, 'preload.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron'],
    alias: localAlias,
    tsconfig: path.join(workspaceRoot, 'tsconfig.json'),
  }),
  build({
    entryPoints: [path.join(rootDir, 'renderer.ts')],
    outfile: path.join(outdir, 'renderer.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'chrome124',
    alias: rendererAlias,
    tsconfig: path.join(workspaceRoot, 'tsconfig.json'),
  }),
])

await fs.copyFile(path.join(rootDir, 'index.html'), path.join(outdir, 'index.html'))
await fs.copyFile(path.join(rootDir, 'index.css'), path.join(outdir, 'index.css'))
await fs.cp(path.join(workspaceRoot, 'assets'), assetsDir, { recursive: true })
await fs.cp(path.join(rootDir, 'test-assets'), path.join(outdir, 'test-assets'), { recursive: true })
await fs.mkdir(wasmDir, { recursive: true })

const ortDistDir = path.join(workspaceRoot, 'node_modules', 'onnxruntime-web', 'dist')
for (const fileName of await fs.readdir(ortDistDir)) {
  if (!fileName.endsWith('.wasm') && !fileName.endsWith('.mjs')) {
    continue
  }
  await fs.copyFile(path.join(ortDistDir, fileName), path.join(wasmDir, fileName))
}

console.log('Build success')