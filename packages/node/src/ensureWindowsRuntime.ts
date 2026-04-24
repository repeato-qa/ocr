import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const RequiredWindowsRuntimeDlls = ['msvcp140.dll', 'msvcp140_1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']
const RuntimeReadyKey = Symbol.for('repeato.ocr.windowsRuntimeReady')

/**
 * Ensures the packaged Windows CRT DLLs are available before onnxruntime-node
 * attempts to load its native binding.
 */
export function ensureWindowsRuntimeDependencies() {
  if (process.platform !== 'win32') {
    return
  }

  const globalState = globalThis as typeof globalThis & { [RuntimeReadyKey]?: boolean }
  if (globalState[RuntimeReadyKey]) {
    return
  }

  const runtimeDir = resolveWindowsRuntimeDir()
  const missingDlls = RequiredWindowsRuntimeDlls.filter(fileName => !fs.existsSync(path.join(runtimeDir, fileName)))
  if (missingDlls.length > 0) {
    throw new Error(`Missing packaged Windows OCR runtime DLLs in ${runtimeDir}: ${missingDlls.join(', ')}`)
  }

  stageRuntimeDllsForOnnxruntime(runtimeDir)
  prependToPath(runtimeDir)
  globalState[RuntimeReadyKey] = true
}

/**
 * Copies the required VC runtime DLLs next to onnxruntime_binding.node so
 * Windows can resolve them without relying on PATH mutation alone.
 *
 * @param {string} runtimeDir
 */
function stageRuntimeDllsForOnnxruntime(runtimeDir: string) {
  const onnxruntimeDir = resolveOnnxruntimeBinaryDir()

  for (const fileName of RequiredWindowsRuntimeDlls) {
    const sourcePath = path.join(runtimeDir, fileName)
    const targetPath = path.join(onnxruntimeDir, fileName)
    if (shouldCopyRuntimeDll(sourcePath, targetPath)) {
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

function resolveWindowsRuntimeDir() {
  const rootDir = resolveRootDir()
  const runtimeDirName = `win32-${process.arch}`
  const candidates = [
    path.resolve(rootDir, 'runtime', runtimeDirName),
    path.resolve(rootDir, '..', 'runtime', runtimeDirName),
    path.resolve(rootDir, '..', 'build', 'node', 'runtime', runtimeDirName),
    path.resolve(rootDir, '..', '..', 'build', 'node', 'runtime', runtimeDirName),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Could not locate the packaged Windows OCR runtime directory from ${rootDir}`)
}

function prependToPath(runtimeDir: string) {
  const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') || 'Path'
  const pathValue = process.env[pathKey] || ''
  const entries = pathValue.split(';').filter(Boolean)
  const normalizedRuntimeDir = path.resolve(runtimeDir).toLowerCase()
  const alreadyPresent = entries.some(entry => path.resolve(entry).toLowerCase() === normalizedRuntimeDir)
  const nextValue = [runtimeDir, ...entries].join(';')

  if (!alreadyPresent) {
    process.env[pathKey] = nextValue
    process.env.PATH = nextValue
  }
}

function resolveOnnxruntimeBinaryDir() {
  const moduleRequire = createRequire(resolveRequireEntryPath())
  const onnxruntimePackagePath = moduleRequire.resolve('onnxruntime-node/package.json')
  const onnxruntimeDir = path.join(path.dirname(onnxruntimePackagePath), 'bin', 'napi-v6', process.platform, process.arch)

  if (!fs.existsSync(onnxruntimeDir)) {
    throw new Error(`Could not locate the onnxruntime-node binary directory at ${onnxruntimeDir}`)
  }

  return onnxruntimeDir
}

/**
 * Returns true when the staged runtime DLL is missing or differs in size from
 * the packaged source copy.
 *
 * @param {string} sourcePath
 * @param {string} targetPath
 * @returns {boolean}
 */
function shouldCopyRuntimeDll(sourcePath: string, targetPath: string) {
  if (!fs.existsSync(targetPath)) {
    return true
  }

  return fs.statSync(sourcePath).size !== fs.statSync(targetPath).size
}

function resolveRootDir() {
  if (typeof __dirname === 'string') {
    return __dirname
  }

  return path.dirname(resolveCurrentFilePath())
}

function resolveRequireEntryPath() {
  if (typeof __filename === 'string') {
    return __filename
  }

  return resolveCurrentFilePath()
}

function resolveCurrentFilePath() {
  const previousPrepareStackTrace = Error.prepareStackTrace

  try {
    Error.prepareStackTrace = (_error, stack) => stack as unknown as string
    const stack = new Error().stack as unknown as Array<{ getFileName?: () => string | null }> | undefined

    for (const callSite of stack || []) {
      const filePath = callSite.getFileName?.()
      if (filePath) {
        return filePath
      }
    }
  } finally {
    Error.prepareStackTrace = previousPrepareStackTrace
  }

  throw new Error('Could not determine the OCR runtime helper path')
}