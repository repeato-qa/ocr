import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(rootDir, '..')
const workspaceRoot = path.resolve(packageDir, '../..')

const sourceRoot = path.join(workspaceRoot, 'packages', 'browser', 'build')
const targetRoot = path.join(packageDir, 'build')

await fs.mkdir(targetRoot, { recursive: true })
await fs.cp(path.join(sourceRoot, 'browser'), path.join(targetRoot, 'browser'), { recursive: true })
await fs.cp(path.join(sourceRoot, 'common'), path.join(targetRoot, 'common'), { recursive: true })