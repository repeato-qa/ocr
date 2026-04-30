type RuntimeModules = {
  fs: typeof import('node:fs')
  path: typeof import('node:path')
}

declare const __non_webpack_require__: NodeRequire | undefined

/**
 * Electron renderer builds can read packaged OCR assets directly, so expose
 * them as in-memory buffers and avoid fetch/file URL edge cases.
 */
export default {
  get detectionPath() {
    const { fs, path } = getRuntimeModules()
    return fs.readFileSync(path.join(resolveAssetDir(), 'ch_PP-OCRv4_det_infer.onnx'))
  },
  get recognitionPath() {
    const { fs, path } = getRuntimeModules()
    return fs.readFileSync(path.join(resolveAssetDir(), 'ch_PP-OCRv4_rec_infer.onnx'))
  },
  get dictionaryPath() {
    const { fs, path } = getRuntimeModules()
    return fs.readFileSync(path.join(resolveAssetDir(), 'ppocr_keys_v1.txt'))
  },
}

function resolveAssetDir() {
  const { fs, path } = getRuntimeModules()
  const candidates = [
    path.resolve(resolvePackageRootDir(), 'build/node/assets'),
    path.resolve(resolveRootDir(), '../../node/assets'),
    path.resolve(resolveRootDir(), '../assets'),
    path.resolve(resolveRootDir(), '../../assets'),
    path.resolve(resolveRootDir(), '../../../../models/assets'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Could not find Electron OCR model assets from ${resolveRootDir()}`)
}

function resolvePackageRootDir() {
  const runtimeRequire = getRuntimeRequire()
  const { path } = getRuntimeModules()

  try {
    return path.dirname(runtimeRequire.resolve('@repeato/ocr/package.json'))
  } catch (_error) {
    return resolveRootDir()
  }
}

function resolveRootDir() {
  const { path } = getRuntimeModules()

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

  throw new Error('Could not determine the Electron OCR default models module path')
}

function getRuntimeModules(): RuntimeModules {
  const runtimeRequire = getRuntimeRequire()

  return {
    fs: runtimeRequire('node:fs'),
    path: runtimeRequire('node:path'),
  }
}

function getRuntimeRequire(): NodeRequire {
  if (typeof __non_webpack_require__ === 'function') {
    return __non_webpack_require__
  }

  if (typeof globalThis.require === 'function') {
    return globalThis.require
  }

  throw new Error('Could not resolve Node require() for Electron OCR asset loading')
}