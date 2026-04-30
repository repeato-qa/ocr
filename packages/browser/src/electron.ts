import Ocr, { registerBackend, type ModelCreateOptions } from '@gutenye/ocr-common'
import { splitIntoLineImages } from '@gutenye/ocr-common/splitIntoLineImages'
import defaultModels from './electronDefaultModels'
import { FileUtils } from './FileUtils'
import { ImageRaw } from './ImageRaw'

let BackendRegistrationPromise: Promise<void> | undefined

/**
 * Returns the current module URL in both ESM and bundled CommonJS builds.
 * The CommonJS electron entry is bundled with esbuild, which does not provide
 * `import.meta.url`, so we fall back to `module.filename` there.
 *
 * @returns {string}
 */
function getCurrentModuleUrl() {
	if (import.meta.url) {
		return import.meta.url
	}

	if (typeof module !== 'undefined' && typeof module.filename === 'string') {
		return new URL(`file://${module.filename}`).href
	}

	throw new Error('Could not determine the current Electron OCR module URL')
}

/**
 * Resolves a runtime URL for the shipped ONNX Runtime WebGPU assets.
 * The published package lives under `node_modules/@repeato/ocr`, so walking
 * up to `node_modules/onnxruntime-web/dist` keeps the browser import relative
 * and avoids bare specifiers when this module runs outside a bundler.
 *
 * @param {string} filename
 * @returns {string}
 */
function getOnnxRuntimeWebAssetUrl(filename: string) {
	return new URL(`../../../../../onnxruntime-web/dist/${filename}`, getCurrentModuleUrl()).href
}

async function ensureBackendRegistered() {
	if (!BackendRegistrationPromise) {
		BackendRegistrationPromise = Promise.resolve()
			.then(async () => {
				const ortModuleUrl = getOnnxRuntimeWebAssetUrl('ort.webgpu.bundle.min.mjs')
				const { InferenceSession, env } = await import(/* webpackIgnore: true */ ortModuleUrl)

				env.wasm.wasmPaths = {
					wasm: getOnnxRuntimeWebAssetUrl('ort-wasm-simd-threaded.asyncify.wasm'),
				}
				env.wasm.numThreads = 1
				env.wasm.proxy = false

				registerBackend({ FileUtils, ImageRaw, InferenceSession, splitIntoLineImages, defaultModels })
			})
			.catch(error => {
				BackendRegistrationPromise = undefined
				throw error
			})
	}

	await BackendRegistrationPromise
}

class ElectronOcr extends Ocr {
	static async create(options: ModelCreateOptions = {}) {
		await ensureBackendRegistered()
		return await Ocr.create(options)
	}
}

export * from '@gutenye/ocr-common'
export const create = ElectronOcr.create.bind(ElectronOcr)
export default ElectronOcr