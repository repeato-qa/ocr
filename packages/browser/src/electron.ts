import Ocr, { registerBackend } from '@gutenye/ocr-common'
import { splitIntoLineImages } from '@gutenye/ocr-common/splitIntoLineImages'
import { InferenceSession } from 'onnxruntime-web/webgpu'
import defaultModels from './electronDefaultModels'
import { FileUtils } from './FileUtils'
import { ImageRaw } from './ImageRaw'

registerBackend({ FileUtils, ImageRaw, InferenceSession, splitIntoLineImages, defaultModels })

export * from '@gutenye/ocr-common'
export const create = Ocr.create.bind(Ocr)
export default Ocr