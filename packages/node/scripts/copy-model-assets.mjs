import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(rootDir, '..')
const workspaceRoot = path.resolve(packageDir, '../..')

const sourceDir = path.join(workspaceRoot, 'packages', 'models', 'assets')
const targetDir = path.join(packageDir, 'build', 'node', 'assets')

await fs.mkdir(path.dirname(targetDir), { recursive: true })
await fs.cp(sourceDir, targetDir, { recursive: true })