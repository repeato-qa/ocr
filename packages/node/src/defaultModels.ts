import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export default {
  get detectionPath() {
    return path.join(resolveAssetDir(), 'ch_PP-OCRv4_det_infer.onnx')
  },
  get recognitionPath() {
    return path.join(resolveAssetDir(), 'ch_PP-OCRv4_rec_infer.onnx')
  },
  get dictionaryPath() {
    return path.join(resolveAssetDir(), 'ppocr_keys_v1.txt')
  },
}

function resolveAssetDir() {
  const rootDir = resolveRootDir()
  const candidates = [
    path.resolve(rootDir, '../../models/assets'),
    path.resolve(rootDir, './assets'),
    path.resolve(rootDir, '../assets'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Could not find OCR model assets from ${rootDir}`)
}

function resolveRootDir() {
  if (typeof __dirname === 'string') {
    return __dirname
  }

  return path.dirname(fileURLToPath(import.meta.url))
}