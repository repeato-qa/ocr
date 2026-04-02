import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(rootDir, '..')
const workspaceRoot = path.resolve(packageDir, '../../..')
const tempRoot = path.join(workspaceRoot, 'temp', 'electron-example-package')
const metadata = JSON.parse(fs.readFileSync(path.join(tempRoot, 'metadata.json'), 'utf8'))

const executablePath = resolveExecutablePath(metadata)
const bundledFixturePath = resolveBundledFixturePath(metadata)
const executableArgs = process.platform === 'linux'
  ? [
      '--no-sandbox',
      '--disable-gpu',
      '--disable-software-rasterizer',
      '--disable-dev-shm-usage',
      '--smoke',
      bundledFixturePath,
      '--mode',
      'main',
    ]
  : ['--smoke', bundledFixturePath, '--mode', 'main']

assert.ok(fs.existsSync(executablePath), `Missing packaged executable at ${executablePath}`)
assert.ok(fs.existsSync(bundledFixturePath), `Missing bundled smoke fixture at ${bundledFixturePath}`)

const result = spawnSync(executablePath, executableArgs, {
  encoding: 'utf8',
  env: {
    ...getSpawnEnv(),
    OMP_THREAD_LIMIT: '1',
    OMP_NUM_THREADS: '1',
    ...(process.platform === 'linux'
      ? {
          GTK_A11Y: 'none',
          NO_AT_BRIDGE: '1',
        }
      : {}),
  },
})

if (result.error) {
  throw result.error
}

if (result.status !== 0) {
  process.stderr.write(result.stdout || '')
  process.stderr.write(result.stderr || '')
  const failureReason = result.signal === null
    ? `exit code ${String(result.status)}`
    : `signal ${result.signal}`
  throw new Error(`Packaged smoke test failed with ${failureReason}`)
}

const output = `${result.stdout || ''}${result.stderr || ''}`
assert.match(output, /Investing\./)
assert.match(output, /Simplified/)
assert.match(output, /Email or Customer Code/)

console.log(output.trim())
console.log('Packaged Electron smoke test passed')

function resolveExecutablePath(currentMetadata) {
  const appDir = currentMetadata.packagedAppDir
  switch (currentMetadata.platform) {
    case 'darwin':
      return path.join(appDir, `${currentMetadata.productName}.app`, 'Contents', 'MacOS', currentMetadata.executableName)
    case 'win32':
      return path.join(appDir, `${currentMetadata.executableName}.exe`)
    default:
      return path.join(appDir, currentMetadata.executableName)
  }
}

function resolveBundledFixturePath(currentMetadata) {
  const appDir = currentMetadata.packagedAppDir
  if (currentMetadata.platform === 'darwin') {
    return path.join(
      appDir,
      `${currentMetadata.productName}.app`,
      'Contents',
      'Resources',
      'app',
      'build',
      'test-assets',
      'login-screen.jpeg',
    )
  }

  return path.join(appDir, 'resources', 'app', 'build', 'test-assets', 'login-screen.jpeg')
}

function getSpawnEnv() {
  if (process.platform !== 'win32') {
    return { ...process.env }
  }

  const env = {}
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('=')) {
      continue
    }
    env[key] = process.env[key]
  }
  return env
}