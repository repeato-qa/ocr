import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyWindowsRuntimeAssets } from './windows-runtime.mjs'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(rootDir, '..')

const copiedFiles = await copyWindowsRuntimeAssets(path.join(packageDir, 'build', 'node', 'runtime'))

if (copiedFiles.length > 0) {
  console.log(`Copied Windows OCR runtime assets: ${copiedFiles.join(', ')}`)
}