import fs from 'node:fs'
import path from 'node:path'

const RequiredWindowsRuntimeDlls = ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']
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

  prependToPath(runtimeDir)
  globalState[RuntimeReadyKey] = true
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

function resolveRootDir() {
  if (typeof __dirname === 'string') {
    return __dirname
  }

  return path.dirname(resolveCurrentFilePath())
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