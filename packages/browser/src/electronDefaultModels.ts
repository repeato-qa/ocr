import fs from 'node:fs'
import path from 'node:path'

/**
 * Electron renderer builds can read packaged OCR assets directly, so expose
 * them as in-memory buffers and avoid fetch/file URL edge cases.
 */
export default {
  get detectionPath() {
    return fs.readFileSync(path.join(resolveAssetDir(), 'ch_PP-OCRv4_det_infer.onnx'))
  },
  get recognitionPath() {
    return fs.readFileSync(path.join(resolveAssetDir(), 'ch_PP-OCRv4_rec_infer.onnx'))
  },
  get dictionaryPath() {
    return fs.readFileSync(path.join(resolveAssetDir(), 'ppocr_keys_v1.txt'))
  },
}

function resolveAssetDir() {
  const candidates = [
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

  throw new Error('Could not determine the Electron OCR default models module path')
}