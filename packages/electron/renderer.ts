import Ocr from '@gutenye/ocr-browser'
import { env } from 'onnxruntime-web'

type RendererBenchmarkMode = 'renderer-wasm' | 'renderer-webgl' | 'renderer-webgpu'
type MainBenchmarkMode = 'main' | 'main-webgpu' | 'main-coreml'

type DetectionLine = {
  text: string
  mean: number
}

type BenchmarkDetection = {
  durationMs: number
  texts: DetectionLine[]
}

type BenchmarkResult = {
  mode: RendererBenchmarkMode
  iterations: number
  warmupIterations: number
  coldStartDurationMs: number
  steadyStateAverageDurationMs: number
  averageDurationMs: number
  steadyStateDurationsMs: number[]
  durationsMs: number[]
  texts: DetectionLine[]
}

declare global {
  interface Window {
    electronOcr: {
      detectInMain: (imagePath: string, mode?: MainBenchmarkMode) => Promise<BenchmarkDetection>
      loadAsset: (name: string) => Promise<Uint8Array>
      loadImageDataUrl: (imagePath: string) => Promise<string>
      openImage: () => Promise<{ imagePath: string; imageUrl: string } | null>
    }
    runRendererBenchmark: (request: { imagePath?: string; imageUrl: string; iterations: number; mode: RendererBenchmarkMode }) => Promise<BenchmarkResult>
  }
}

let selectedImagePath = ''
let selectedImageUrl = ''
const rendererOcrPromises = new Map<RendererBenchmarkMode, Promise<Awaited<ReturnType<typeof Ocr.create>>>>()

env.wasm.wasmPaths = './wasm/'
env.wasm.numThreads = 1
env.wasm.proxy = false

const rendererWasmStatusEl = getEl<HTMLParagraphElement>('#renderer-wasm-status')
const rendererWasmOutputEl = getEl<HTMLPreElement>('#renderer-wasm-output')
const rendererWebglStatusEl = getEl<HTMLParagraphElement>('#renderer-webgl-status')
const rendererWebglOutputEl = getEl<HTMLPreElement>('#renderer-webgl-output')
const rendererWebgpuStatusEl = getEl<HTMLParagraphElement>('#renderer-webgpu-status')
const rendererWebgpuOutputEl = getEl<HTMLPreElement>('#renderer-webgpu-output')
const mainStatusEl = getEl<HTMLParagraphElement>('#main-status')
const mainOutputEl = getEl<HTMLPreElement>('#main-output')
const mainWebgpuStatusEl = getEl<HTMLParagraphElement>('#main-webgpu-status')
const mainWebgpuOutputEl = getEl<HTMLPreElement>('#main-webgpu-output')
const mainCoremlStatusEl = getEl<HTMLParagraphElement>('#main-coreml-status')
const mainCoremlOutputEl = getEl<HTMLPreElement>('#main-coreml-output')
const compareOutputEl = getEl<HTMLPreElement>('#compare-output')
const selectedImageEl = getEl<HTMLParagraphElement>('#selected-image')
const previewImageEl = getEl<HTMLImageElement>('#preview-image')
const pickImageButton = getEl<HTMLButtonElement>('#pick-image')
const runRendererWasmButton = getEl<HTMLButtonElement>('#run-renderer-wasm')
const runRendererWebglButton = getEl<HTMLButtonElement>('#run-renderer-webgl')
const runRendererWebgpuButton = getEl<HTMLButtonElement>('#run-renderer-webgpu')
const runMainButton = getEl<HTMLButtonElement>('#run-main')
const runMainWebgpuButton = getEl<HTMLButtonElement>('#run-main-webgpu')
const runMainCoremlButton = getEl<HTMLButtonElement>('#run-main-coreml')
const runCompareButton = getEl<HTMLButtonElement>('#run-compare')

function getMainStatusEl(mode: MainBenchmarkMode) {
  if (mode === 'main-webgpu') {
    return mainWebgpuStatusEl
  }
  if (mode === 'main-coreml') {
    return mainCoremlStatusEl
  }
  return mainStatusEl
}

function getMainOutputEl(mode: MainBenchmarkMode) {
  if (mode === 'main-webgpu') {
    return mainWebgpuOutputEl
  }
  if (mode === 'main-coreml') {
    return mainCoremlOutputEl
  }
  return mainOutputEl
}

function getMainLabel(mode: MainBenchmarkMode) {
  if (mode === 'main-webgpu') {
    return 'Main Thread WebGPU (Experimental)'
  }
  if (mode === 'main-coreml') {
    return 'Main Thread CoreML (macOS)'
  }
  return 'Main Thread CPU'
}

async function runMainDetections(mode: MainBenchmarkMode, iterations: number, warmupIterations = 1) {
  let coldStartDetection: BenchmarkDetection | undefined
  for (let index = 0; index < warmupIterations; index += 1) {
    coldStartDetection = await window.electronOcr.detectInMain(selectedImagePath, mode)
  }

  const steadyStateDetections: BenchmarkDetection[] = []
  for (let index = 0; index < iterations; index += 1) {
    steadyStateDetections.push(await window.electronOcr.detectInMain(selectedImagePath, mode))
  }

  return {
    coldStartDetection,
    steadyStateDetections,
  }
}

function getRendererStatusEl(mode: RendererBenchmarkMode) {
  if (mode === 'renderer-webgl') {
    return rendererWebglStatusEl
  }
  if (mode === 'renderer-webgpu') {
    return rendererWebgpuStatusEl
  }
  return rendererWasmStatusEl
}

function getRendererOutputEl(mode: RendererBenchmarkMode) {
  if (mode === 'renderer-webgl') {
    return rendererWebglOutputEl
  }
  if (mode === 'renderer-webgpu') {
    return rendererWebgpuOutputEl
  }
  return rendererWasmOutputEl
}

function getRendererLabel(mode: RendererBenchmarkMode) {
  if (mode === 'renderer-webgl') {
    return 'Renderer WebGL (Experimental)'
  }
  if (mode === 'renderer-webgpu') {
    return 'Renderer WebGPU'
  }
  return 'Renderer WASM'
}

function getEl<T extends Element>(selector: string) {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`Missing element: ${selector}`)
  }
  return element as T
}

async function getRendererOcr(mode: RendererBenchmarkMode) {
  if (!rendererOcrPromises.has(mode)) {
    getRendererStatusEl(mode).textContent = `Loading bundled models in ${getRendererLabel(mode).toLowerCase()}...`
    rendererOcrPromises.set(mode, createRendererOcr(mode))
  }
  return await rendererOcrPromises.get(mode)!
}

async function createRendererOcr(mode: RendererBenchmarkMode) {
  return await Ocr.create({
    onnxOptions: {
      executionProviders: [mode === 'renderer-webgl' ? 'webgl' : mode === 'renderer-webgpu' ? 'webgpu' : 'wasm'],
    },
    models: {
      detectionPath: await window.electronOcr.loadAsset('ch_PP-OCRv4_det_infer.onnx'),
      recognitionPath: await window.electronOcr.loadAsset('ch_PP-OCRv4_rec_infer.onnx'),
      dictionaryPath: await window.electronOcr.loadAsset('ppocr_keys_v1.txt'),
    },
  })
}

function toDetectionOutput(result: BenchmarkDetection) {
  return [`${result.durationMs.toFixed(1)}ms`, ...result.texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`)].join('\n')
}

async function runRendererDetection(imageUrl: string, mode: RendererBenchmarkMode): Promise<BenchmarkDetection> {
  const ocr = await getRendererOcr(mode)
  const start = performance.now()
  const result = await ocr.detect(imageUrl)
  return {
    durationMs: performance.now() - start,
    texts: result.texts.map(({ text, mean }) => ({ text, mean })),
  }
}

async function resolveRendererImageUrl({ imagePath, imageUrl }: { imagePath?: string; imageUrl: string }) {
  if (imagePath) {
    return await window.electronOcr.loadImageDataUrl(imagePath)
  }
  return imageUrl
}

async function runRendererBenchmark({ imagePath, imageUrl, iterations, mode }: { imagePath?: string; imageUrl: string; iterations: number; mode: RendererBenchmarkMode }): Promise<BenchmarkResult> {
  const warmupIterations = 1
  let latestResult: BenchmarkDetection | undefined
  const resolvedImageUrl = await resolveRendererImageUrl({ imagePath, imageUrl })
  let coldStartResult: BenchmarkDetection | undefined
  for (let index = 0; index < warmupIterations; index += 1) {
    coldStartResult = await runRendererDetection(resolvedImageUrl, mode)
  }

  const steadyStateDurationsMs: number[] = []
  for (let index = 0; index < iterations; index += 1) {
    latestResult = await runRendererDetection(resolvedImageUrl, mode)
    steadyStateDurationsMs.push(latestResult.durationMs)
  }

  return {
    mode,
    iterations,
    warmupIterations,
    coldStartDurationMs: coldStartResult?.durationMs || 0,
    steadyStateAverageDurationMs: steadyStateDurationsMs.reduce((sum, value) => sum + value, 0) / steadyStateDurationsMs.length,
    averageDurationMs: steadyStateDurationsMs.reduce((sum, value) => sum + value, 0) / steadyStateDurationsMs.length,
    steadyStateDurationsMs,
    durationsMs: steadyStateDurationsMs,
    texts: latestResult?.texts || [],
  }
}

async function chooseImage() {
  const image = await window.electronOcr.openImage()
  if (!image) {
    return
  }
  selectedImagePath = image.imagePath
  selectedImageUrl = await window.electronOcr.loadImageDataUrl(image.imagePath)
  selectedImageEl.textContent = image.imagePath
  previewImageEl.src = selectedImageUrl
  previewImageEl.style.display = 'block'
  runRendererWasmButton.disabled = false
  runRendererWebglButton.disabled = false
  runRendererWebgpuButton.disabled = false
  runMainButton.disabled = false
  runMainWebgpuButton.disabled = false
  runMainCoremlButton.disabled = false
  runCompareButton.disabled = false
}

async function handleRunRenderer(mode: RendererBenchmarkMode) {
  const statusEl = getRendererStatusEl(mode)
  const outputEl = getRendererOutputEl(mode)
  const label = getRendererLabel(mode)
  statusEl.textContent = `Running ${label.toLowerCase()} OCR...`
  try {
    const detection = await runRendererDetection(selectedImageUrl, mode)
    statusEl.textContent = `${label} OCR complete`
    outputEl.textContent = toDetectionOutput(detection)
  } catch (error) {
    statusEl.textContent = `${label} OCR failed`
    outputEl.textContent = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }
}

async function handleRunMain(mode: MainBenchmarkMode) {
  const statusEl = getMainStatusEl(mode)
  const outputEl = getMainOutputEl(mode)
  statusEl.textContent = `Running ${getMainLabel(mode).toLowerCase()} OCR...`
  try {
    const detection = await window.electronOcr.detectInMain(selectedImagePath, mode)
    statusEl.textContent = `${getMainLabel(mode)} OCR complete`
    outputEl.textContent = toDetectionOutput(detection)
  } catch (error) {
    statusEl.textContent = `${getMainLabel(mode)} OCR failed`
    outputEl.textContent = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  }
}

async function handleCompare() {
  compareOutputEl.textContent = 'Benchmarking supported modes: renderer WASM, renderer WebGPU, main-thread CPU, main-thread WebGPU, and main-thread CoreML...'
  const mainWarmupIterations = 1
  const mainIterations = 3
  const [rendererWasmResult, rendererWebgpuResult, mainResult, mainWebgpuResult, mainCoremlResult] = await Promise.all([
    runRendererBenchmark({ imageUrl: selectedImageUrl, iterations: 3, mode: 'renderer-wasm' }).catch(error => ({
      mode: 'renderer-wasm' as const,
      error: error instanceof Error ? error.message : String(error),
    })),
    runRendererBenchmark({ imageUrl: selectedImageUrl, iterations: 3, mode: 'renderer-webgpu' }).catch(error => ({
      mode: 'renderer-webgpu' as const,
      error: error instanceof Error ? error.message : String(error),
    })),
    runMainDetections('main', mainIterations, mainWarmupIterations).catch(error => ({
      mode: 'main' as const,
      error: error instanceof Error ? error.message : String(error),
    })),
    runMainDetections('main-webgpu', mainIterations, mainWarmupIterations).catch(error => ({
      mode: 'main-webgpu' as const,
      error: error instanceof Error ? error.message : String(error),
    })),
    runMainDetections('main-coreml', mainIterations, mainWarmupIterations).catch(error => ({
      mode: 'main-coreml' as const,
      error: error instanceof Error ? error.message : String(error),
    })),
  ])

  const mainDurations = 'steadyStateDetections' in mainResult ? mainResult.steadyStateDetections.map((result) => result.durationMs) : []
  const mainAverage = mainDurations.length ? mainDurations.reduce((sum, value) => sum + value, 0) / mainDurations.length : 0
  const mainWebgpuDurations = 'steadyStateDetections' in mainWebgpuResult ? mainWebgpuResult.steadyStateDetections.map((result) => result.durationMs) : []
  const mainWebgpuAverage = mainWebgpuDurations.length ? mainWebgpuDurations.reduce((sum, value) => sum + value, 0) / mainWebgpuDurations.length : 0
  const mainCoremlDurations = 'steadyStateDetections' in mainCoremlResult ? mainCoremlResult.steadyStateDetections.map((result) => result.durationMs) : []
  const mainCoremlAverage = mainCoremlDurations.length ? mainCoremlDurations.reduce((sum, value) => sum + value, 0) / mainCoremlDurations.length : 0

  rendererWasmOutputEl.textContent = 'texts' in rendererWasmResult ? rendererWasmResult.texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`).join('\n') : rendererWasmResult.error
  rendererWebgpuOutputEl.textContent = 'texts' in rendererWebgpuResult ? rendererWebgpuResult.texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`).join('\n') : rendererWebgpuResult.error
  mainOutputEl.textContent = 'steadyStateDetections' in mainResult ? mainResult.steadyStateDetections[0].texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`).join('\n') : mainResult.error
  mainWebgpuOutputEl.textContent = 'steadyStateDetections' in mainWebgpuResult ? mainWebgpuResult.steadyStateDetections[0].texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`).join('\n') : mainWebgpuResult.error
  mainCoremlOutputEl.textContent = 'steadyStateDetections' in mainCoremlResult ? mainCoremlResult.steadyStateDetections[0].texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`).join('\n') : mainCoremlResult.error
  rendererWasmStatusEl.textContent = 'texts' in rendererWasmResult ? 'Renderer WASM OCR complete' : 'Renderer WASM OCR failed'
  rendererWebgpuStatusEl.textContent = 'texts' in rendererWebgpuResult ? 'Renderer WebGPU OCR complete' : 'Renderer WebGPU OCR failed'
  rendererWebglStatusEl.textContent = 'Skipped in default comparison'
  rendererWebglOutputEl.textContent = 'Use the experimental WebGL button or CLI mode to verify incompatibilities with the current OCR models.'
  mainStatusEl.textContent = 'steadyStateDetections' in mainResult ? 'Main-thread CPU OCR complete' : 'Main-thread CPU OCR failed'
  mainWebgpuStatusEl.textContent = 'steadyStateDetections' in mainWebgpuResult ? 'Main-thread WebGPU OCR complete' : 'Main-thread WebGPU OCR failed'
  mainCoremlStatusEl.textContent = 'steadyStateDetections' in mainCoremlResult ? 'Main-thread CoreML OCR complete' : 'Main-thread CoreML OCR failed'

  compareOutputEl.textContent = [
    'texts' in rendererWasmResult ? `Renderer WASM cold-start: ${rendererWasmResult.coldStartDurationMs.toFixed(1)}ms` : `Renderer WASM failed: ${rendererWasmResult.error}`,
    'texts' in rendererWasmResult ? `Renderer WASM steady-state average: ${rendererWasmResult.steadyStateAverageDurationMs.toFixed(1)}ms` : 'Renderer WASM steady-state average: unavailable',
    'texts' in rendererWebgpuResult ? `Renderer WebGPU cold-start: ${rendererWebgpuResult.coldStartDurationMs.toFixed(1)}ms` : `Renderer WebGPU failed: ${rendererWebgpuResult.error}`,
    'texts' in rendererWebgpuResult ? `Renderer WebGPU steady-state average: ${rendererWebgpuResult.steadyStateAverageDurationMs.toFixed(1)}ms` : 'Renderer WebGPU steady-state average: unavailable',
    'steadyStateDetections' in mainResult ? `Main CPU cold-start: ${(mainResult.coldStartDetection?.durationMs || 0).toFixed(1)}ms` : `Main CPU failed: ${mainResult.error}`,
    'steadyStateDetections' in mainResult ? `Main CPU steady-state average: ${mainAverage.toFixed(1)}ms` : 'Main CPU steady-state average: unavailable',
    'steadyStateDetections' in mainWebgpuResult ? `Main WebGPU cold-start: ${(mainWebgpuResult.coldStartDetection?.durationMs || 0).toFixed(1)}ms` : `Main WebGPU failed: ${mainWebgpuResult.error}`,
    'steadyStateDetections' in mainWebgpuResult ? `Main WebGPU steady-state average: ${mainWebgpuAverage.toFixed(1)}ms` : 'Main WebGPU steady-state average: unavailable',
    'steadyStateDetections' in mainCoremlResult ? `Main CoreML cold-start: ${(mainCoremlResult.coldStartDetection?.durationMs || 0).toFixed(1)}ms` : `Main CoreML failed: ${mainCoremlResult.error}`,
    'steadyStateDetections' in mainCoremlResult ? `Main CoreML steady-state average: ${mainCoremlAverage.toFixed(1)}ms` : 'Main CoreML steady-state average: unavailable',
    'texts' in rendererWasmResult ? `WASM steady-state delta vs main: ${(rendererWasmResult.steadyStateAverageDurationMs - mainAverage).toFixed(1)}ms` : 'WASM steady-state delta vs main: unavailable',
    'texts' in rendererWebgpuResult ? `WebGPU steady-state delta vs main: ${(rendererWebgpuResult.steadyStateAverageDurationMs - mainAverage).toFixed(1)}ms` : 'WebGPU steady-state delta vs main: unavailable',
    mainDurations.length && mainWebgpuDurations.length ? `Main WebGPU steady-state delta vs CPU main: ${(mainWebgpuAverage - mainAverage).toFixed(1)}ms` : 'Main WebGPU steady-state delta vs CPU main: unavailable',
    mainDurations.length && mainCoremlDurations.length ? `Main CoreML steady-state delta vs CPU main: ${(mainCoremlAverage - mainAverage).toFixed(1)}ms` : 'Main CoreML steady-state delta vs CPU main: unavailable',
    'texts' in rendererWasmResult ? `Renderer WASM steady-state runs: ${rendererWasmResult.steadyStateDurationsMs.map((value) => value.toFixed(1)).join(', ')}` : 'Renderer WASM steady-state runs: unavailable',
    'texts' in rendererWebgpuResult ? `Renderer WebGPU steady-state runs: ${rendererWebgpuResult.steadyStateDurationsMs.map((value) => value.toFixed(1)).join(', ')}` : 'Renderer WebGPU steady-state runs: unavailable',
    mainDurations.length ? `Main CPU steady-state runs: ${mainDurations.map((value) => value.toFixed(1)).join(', ')}` : 'Main CPU steady-state runs: unavailable',
    mainWebgpuDurations.length ? `Main WebGPU steady-state runs: ${mainWebgpuDurations.map((value) => value.toFixed(1)).join(', ')}` : 'Main WebGPU steady-state runs: unavailable',
    mainCoremlDurations.length ? `Main CoreML steady-state runs: ${mainCoremlDurations.map((value) => value.toFixed(1)).join(', ')}` : 'Main CoreML steady-state runs: unavailable',
  ].join('\n')
}

pickImageButton.addEventListener('click', () => {
  void chooseImage()
})

runRendererWasmButton.addEventListener('click', () => {
  void handleRunRenderer('renderer-wasm')
})

runRendererWebglButton.addEventListener('click', () => {
  void handleRunRenderer('renderer-webgl')
})

runRendererWebgpuButton.addEventListener('click', () => {
  void handleRunRenderer('renderer-webgpu')
})

runMainButton.addEventListener('click', () => {
  void handleRunMain('main')
})

runMainWebgpuButton.addEventListener('click', () => {
  void handleRunMain('main-webgpu')
})

runMainCoremlButton.addEventListener('click', () => {
  void handleRunMain('main-coreml')
})

runCompareButton.addEventListener('click', () => {
  void handleCompare()
})

window.runRendererBenchmark = runRendererBenchmark