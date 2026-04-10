import path from 'node:path'
import Ocr from '@repeato/ocr'

async function main() {
  const imagePath = process.argv[2]
  if (!imagePath) {
    throw new Error('Expected an image path argument')
  }

  const buildDir = __dirname
  const ocr = await Ocr.create({
    models: {
      detectionPath: path.join(buildDir, 'assets', 'ch_PP-OCRv4_det_infer.onnx'),
      recognitionPath: path.join(buildDir, 'assets', 'ch_PP-OCRv4_rec_infer.onnx'),
      dictionaryPath: path.join(buildDir, 'assets', 'ppocr_keys_v1.txt'),
    },
  })

  const result = await ocr.detect(imagePath)
  if (!result.texts.length) {
    throw new Error('OCR returned no text lines.')
  }

  const output = result.texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`).join('\n')
  console.log(output)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})