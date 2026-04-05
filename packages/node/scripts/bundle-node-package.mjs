import path from 'node:path'
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(rootDir, '..')
const workspaceRoot = path.resolve(packageDir, '../..')

const alias = {
  '@gutenye/ocr-common': path.join(workspaceRoot, 'packages/common/src/index.ts'),
  '@gutenye/ocr-common/splitIntoLineImages': path.join(workspaceRoot, 'packages/common/src/backend/splitIntoLineImages.ts'),
}

await Promise.all([
  build({
    entryPoints: [path.join(packageDir, 'src/index.ts')],
    outfile: path.join(packageDir, 'build/node/index.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['onnxruntime-node', 'sharp'],
    logOverride: {
      'empty-import-meta': 'silent',
    },
    alias,
    tsconfig: path.join(workspaceRoot, 'tsconfig.json'),
  }),
  build({
    entryPoints: [path.join(packageDir, 'src/electron.ts')],
    outfile: path.join(packageDir, 'build/node/electron.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['onnxruntime-node', 'sharp'],
    logOverride: {
      'empty-import-meta': 'silent',
    },
    alias,
    tsconfig: path.join(workspaceRoot, 'tsconfig.json'),
  }),
])

await fs.writeFile(
  path.join(packageDir, 'build/node/index.js'),
  [
    "import moduleExports from './index.cjs'",
    'const defaultExport = moduleExports?.default ?? moduleExports',
    'export const registerBackend = moduleExports.registerBackend',
    'export const FileUtilsBase = moduleExports.FileUtilsBase',
    'export const ImageRawBase = moduleExports.ImageRawBase',
    'export default defaultExport',
    '',
  ].join('\n'),
)

await fs.writeFile(
  path.join(packageDir, 'build/node/electron.js'),
  [
    "export { default } from './index.js'",
    "export * from './index.js'",
    '',
  ].join('\n'),
)