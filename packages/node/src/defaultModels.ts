import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const assetDir = resolveAssetDir()

export default {
  detectionPath: path.join(assetDir, 'ch_PP-OCRv4_det_infer.onnx'),
  recognitionPath: path.join(assetDir, 'ch_PP-OCRv4_rec_infer.onnx'),
  dictionaryPath: path.join(assetDir, 'ppocr_keys_v1.txt'),
}

function resolveAssetDir() {
  const candidates = [
    path.resolve(rootDir, '../../models/assets'),
    path.resolve(rootDir, '../assets'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  throw new Error(`Could not find OCR model assets from ${rootDir}`)
}