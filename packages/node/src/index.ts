import fs from 'node:fs/promises'
import BaseOcr, { registerBackend, type ModelCreateOptions } from '@gutenye/ocr-common'
import { splitIntoLineImages } from '@gutenye/ocr-common/splitIntoLineImages'
import defaultModels from './defaultModels'
import { ensureWindowsRuntimeDependencies } from './ensureWindowsRuntime'
import { FileUtils } from './FileUtils'
import { ImageRaw } from './ImageRaw'

let BackendRegistrationPromise: Promise<void> | undefined

async function ensureBackendRegistered() {
  if (!BackendRegistrationPromise) {
    BackendRegistrationPromise = Promise.resolve()
      .then(async () => {
        ensureWindowsRuntimeDependencies()
        const { InferenceSession } = await import('onnxruntime-node')

        registerBackend({
          FileUtils,
          ImageRaw,
          InferenceSession,
          splitIntoLineImages,
          defaultModels,
        })
      })
      .catch(error => {
        BackendRegistrationPromise = undefined
        throw error
      })
  }

  await BackendRegistrationPromise
}

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
class Ocr extends BaseOcr {
  static async create(options: ModelCreateOptions = {}) {
    await ensureBackendRegistered()
    const ocr = await BaseOcr.create(options)
    if (options.debugOutputDir) {
      await fs.mkdir(options.debugOutputDir, { recursive: true })
    }
    return ocr
  }
}

export * from '@gutenye/ocr-common'
export const create = Ocr.create.bind(Ocr)

/**
 * Releases all live Ocr instances before process exit. Prevents the
 * onnxruntime-node thread-pool mutex crash that occurs when native
 * InferenceSession objects are garbage-collected during Node.js shutdown.
 */
export const releaseAll = () => Ocr.releaseAll()

export default Ocr
