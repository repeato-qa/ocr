import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { RequiredWindowsRuntimeDlls, getWindowsRuntimeDirName } from './windows-runtime.mjs'

const execFileAsync = promisify(execFile)
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = path.resolve(packageDir, '../..')
const verifyDir = path.join(workspaceRoot, 'temp', 'npm-release-check')
const fixturePath = path.join(workspaceRoot, 'packages', 'electron', 'test-assets', 'login-screen.jpeg')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const explicitTarballPath = process.env.REPEATO_OCR_TARBALL_PATH
const shouldVerifyWindowsRuntime = process.platform === 'win32' || process.env.REPEATO_OCR_VERIFY_WINDOWS_RUNTIME === '1'

async function run(command, args, cwd) {
  return await runWithEnv(command, args, cwd, getBaseEnv())
}

async function runWithEnv(command, args, cwd, env) {
  const result = await execFileAsync(...getExecFileArgs(command, args), {
    cwd,
    env,
    maxBuffer: 20 * 1024 * 1024,
  })

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  return result.stdout.trim()
}

function getExecFileArgs(command, args) {
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    const systemRoot = process.env.SystemRoot || 'C:\\Windows'
    const comSpec = process.env.ComSpec || path.join(systemRoot, 'System32', 'cmd.exe')
    return [comSpec, ['/d', '/s', '/c', buildWindowsCommand(command, args)]]
  }

  return [command, args]
}

function buildWindowsCommand(command, args) {
  return [command, ...args].map(quoteWindowsArg).join(' ')
}

function quoteWindowsArg(value) {
  if (/^[A-Za-z0-9_./:@\\-]+$/.test(value)) {
    return value
  }

  return `"${value.replace(/"/g, '\\"')}"`
}

function parsePackOutput(output) {
  const startIndexes = []

  for (let index = output.indexOf('['); index >= 0; index = output.indexOf('[', index + 1)) {
    startIndexes.push(index)
  }

  const endIndexes = []
  for (let index = output.lastIndexOf(']'); index >= 0; index = output.lastIndexOf(']', index - 1)) {
    endIndexes.push(index)
  }

  for (const startIndex of startIndexes) {
    for (const endIndex of endIndexes) {
      if (endIndex <= startIndex) {
        continue
      }

      const candidate = output.slice(startIndex, endIndex + 1)

      try {
        const parsed = JSON.parse(candidate)
        if (Array.isArray(parsed) && parsed.every(entry => typeof entry?.filename === 'string')) {
          return parsed
        }
      } catch {
        // Keep scanning until we find the actual npm pack JSON payload.
      }
    }
  }

  throw new Error(`Could not locate npm pack JSON output in:\n${output}`)
}

let tarballPath = ''

try {
  await fs.rm(verifyDir, { recursive: true, force: true })
  await fs.mkdir(verifyDir, { recursive: true })

  if (explicitTarballPath) {
    tarballPath = path.resolve(explicitTarballPath)
  } else {
    const packOutput = await run(npmCommand, ['pack', '--json'], packageDir)
    const [{ filename }] = parsePackOutput(packOutput)
    tarballPath = path.join(packageDir, filename)
  }

  await run(npmCommand, ['init', '-y'], verifyDir)
  await run(npmCommand, ['install', tarballPath, 'sharp@0.34.5', '--legacy-peer-deps'], verifyDir)

  const installedPackageDir = path.join(verifyDir, 'node_modules', '@repeato', 'ocr')
  await assertWindowsPackageIsSelfContained(installedPackageDir)

  // Verify both module systems. The Electron example mostly exercises ESM imports,
  // but applications such as Repeato-Studio load the published package via
  // webpack externals, which resolves through CommonJS `require()` at runtime.
  const verifyProgram = [
    `const fixturePath = ${JSON.stringify(fixturePath)}`,
    "const pkg = await import('@repeato/ocr')",
    "const electron = await import('@repeato/ocr/electron')",
    "const { createRequire } = await import('node:module')",
    "const require = createRequire(import.meta.url)",
    "const pkgCjs = require('@repeato/ocr')",
    "const electronCjs = require('@repeato/ocr/electron')",
    "const { default: sharp } = await import('sharp')",
    "if (typeof pkg.default?.create !== 'function') throw new Error('Missing default create() on @repeato/ocr')",
    "if (typeof electron.default?.create !== 'function') throw new Error('Missing default create() on @repeato/ocr/electron')",
    "if (typeof pkgCjs.create !== 'function') throw new Error('Missing create() on CommonJS @repeato/ocr')",
    "if (typeof electronCjs.create !== 'function') throw new Error('Missing create() on CommonJS @repeato/ocr/electron')",
    "const rawImage = await sharp(fixturePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })",
    "const ocr = await pkg.default.create()",
    'const result = await ocr.detect({ data: rawImage.data, width: rawImage.info.width, height: rawImage.info.height })',
    "if (!Array.isArray(result.texts) || result.texts.length === 0) throw new Error('OCR detect returned no texts')",
    "console.log(JSON.stringify({ defaultCreate: typeof pkg.default.create, electronCreate: typeof electron.default.create, cjsCreate: typeof pkgCjs.create, cjsElectronCreate: typeof electronCjs.create, detectedTexts: result.texts.length }, null, 2))",
  ].join('; ')

  const verifyOutput = await runWithEnv(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      verifyProgram,
    ],
    verifyDir,
    getVerificationEnv(verifyDir),
  )

  process.stdout.write(`${verifyOutput}\n`)
} finally {
  await fs.rm(verifyDir, { recursive: true, force: true })
  if (tarballPath && !explicitTarballPath) {
    await fs.rm(tarballPath, { force: true })
  }
}

async function assertWindowsPackageIsSelfContained(installedPackageDir) {
  if (!shouldVerifyWindowsRuntime) {
    return
  }

  const runtimeDir = path.join(installedPackageDir, 'build', 'node', 'runtime', getWindowsRuntimeDirName())
  for (const dllName of RequiredWindowsRuntimeDlls) {
    const dllPath = path.join(runtimeDir, dllName)
    assert.ok(await fileExists(dllPath), `Missing packaged Windows OCR runtime DLL ${dllName} at ${dllPath}`)
  }
}

function getVerificationEnv(cwd) {
  if (process.platform !== 'win32') {
    return process.env
  }

  const systemRoot = process.env.SystemRoot || 'C:\\Windows'
  const nodeDir = path.dirname(process.execPath)
  const env = getWindowsSpawnEnv()
  const pathKey = getPathEnvKey(env)

  env.SystemRoot = systemRoot
  env.windir = process.env.windir || systemRoot
  env.ComSpec = process.env.ComSpec || path.join(systemRoot, 'System32', 'cmd.exe')
  env.TEMP = process.env.TEMP || path.join(cwd, '.temp')
  env.TMP = process.env.TMP || path.join(cwd, '.temp')
  env[pathKey] = [nodeDir, path.join(systemRoot, 'System32'), systemRoot].join(';')
  env.OMP_THREAD_LIMIT = '1'
  env.OMP_NUM_THREADS = '1'

  return env
}

function getBaseEnv() {
  if (process.platform !== 'win32') {
    return process.env
  }

  return getWindowsSpawnEnv()
}

function getWindowsSpawnEnv() {
  const env = {}

  for (const key of Object.keys(process.env)) {
    if (key.startsWith('=')) {
      continue
    }

    env[key] = process.env[key]
  }

  return env
}

function getPathEnvKey(env) {
  return Object.keys(env).find(key => key.toLowerCase() === 'path') || 'Path'
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}