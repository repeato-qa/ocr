import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { RequiredWindowsRuntimeDlls, getWindowsRuntimeDirName } from '../../node/scripts/windows-runtime.mjs'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(rootDir, '..')
const workspaceRoot = path.resolve(packageDir, '../..')
const tempRoot = path.join(workspaceRoot, 'temp', 'electron-package')
const metadata = JSON.parse(fs.readFileSync(path.join(tempRoot, 'metadata.json'), 'utf8'))

const executablePath = resolveExecutablePath(metadata)
const bundledFixturePath = resolveBundledFixturePath(metadata)
const smokeScriptPath = resolvePackagedSmokeScriptPath(metadata)
const linuxRunAsNode = process.platform === 'linux'
const executableArgs = linuxRunAsNode
  ? [smokeScriptPath, bundledFixturePath]
  : ['--smoke', bundledFixturePath, '--mode', 'main']

assert.ok(fs.existsSync(executablePath), `Missing packaged executable at ${executablePath}`)
assert.ok(fs.existsSync(bundledFixturePath), `Missing bundled smoke fixture at ${bundledFixturePath}`)
if (linuxRunAsNode) {
  assert.ok(fs.existsSync(smokeScriptPath), `Missing packaged smoke script at ${smokeScriptPath}`)
}

assertWindowsRuntimeFiles(metadata)

const result = spawnSync(executablePath, executableArgs, {
  encoding: 'utf8',
  env: {
    ...getSmokeEnv(executablePath),
    OMP_THREAD_LIMIT: '1',
    OMP_NUM_THREADS: '1',
    ...(process.platform === 'linux'
      ? {
          ELECTRON_RUN_AS_NODE: '1',
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
assert.match(output, /Repeato Demo App/)
assert.match(output, /Secure sign in/)
assert.match(output, /Email \*/)
assert.match(output, /Password \*/)
assert.match(output, /LOGIN/)

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

function resolvePackagedSmokeScriptPath(currentMetadata) {
  const appDir = currentMetadata.packagedAppDir
  if (currentMetadata.platform === 'darwin') {
    return path.join(
      appDir,
      `${currentMetadata.productName}.app`,
      'Contents',
      'Resources',
      'app',
      'build',
      'smoke-node.cjs',
    )
  }

  return path.join(appDir, 'resources', 'app', 'build', 'smoke-node.cjs')
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

function assertWindowsRuntimeFiles(currentMetadata) {
  if (currentMetadata.platform !== 'win32') {
    return
  }

  const runtimeDir = path.join(currentMetadata.packagedAppDir, 'resources', 'app', 'build', 'runtime', getWindowsRuntimeDirName(currentMetadata.arch))
  for (const dllName of RequiredWindowsRuntimeDlls) {
    const dllPath = path.join(runtimeDir, dllName)
    assert.ok(fs.existsSync(dllPath), `Missing packaged Windows OCR runtime DLL ${dllName} at ${dllPath}`)
  }
}

function getSmokeEnv(executablePath) {
  if (process.platform !== 'win32') {
    return getSpawnEnv()
  }

  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  const env = getSpawnEnv()
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'Path'

  env.SystemRoot = systemRoot
  env.windir = process.env.windir || systemRoot
  env.ComSpec = process.env.ComSpec || path.join(systemRoot, 'System32', 'cmd.exe')
  env.TEMP = process.env.TEMP || path.dirname(executablePath)
  env.TMP = process.env.TMP || path.dirname(executablePath)
  env[pathKey] = [path.dirname(executablePath), path.join(systemRoot, 'System32'), systemRoot].join(';')

  return env
}