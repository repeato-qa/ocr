import Ocr from '@gutenye/ocr-browser'
import { env } from 'onnxruntime-web'

type DetectionLine = {
  text: string
  mean: number
}

type BenchmarkDetection = {
  durationMs: number
  texts: DetectionLine[]
}

type BenchmarkResult = {
  mode: 'renderer'
  iterations: number
  averageDurationMs: number
  durationsMs: number[]
  texts: DetectionLine[]
}

declare global {
  interface Window {
    electronOcr: {
      detectInMain: (imagePath: string) => Promise<BenchmarkDetection>
      loadAsset: (name: string) => Promise<Uint8Array>
      loadImageDataUrl: (imagePath: string) => Promise<string>
      openImage: () => Promise<{ imagePath: string; imageUrl: string } | null>
    }
    runRendererBenchmark: (request: { imagePath?: string; imageUrl: string; iterations: number }) => Promise<BenchmarkResult>
  }
}

let selectedImagePath = ''
let selectedImageUrl = ''
let rendererOcrPromise: Promise<Awaited<ReturnType<typeof Ocr.create>>> | undefined

env.wasm.wasmPaths = './wasm/'
env.wasm.numThreads = 1
env.wasm.proxy = false

const rendererStatusEl = getEl<HTMLParagraphElement>('#renderer-status')
const rendererOutputEl = getEl<HTMLPreElement>('#renderer-output')
const mainStatusEl = getEl<HTMLParagraphElement>('#main-status')
const mainOutputEl = getEl<HTMLPreElement>('#main-output')
const compareOutputEl = getEl<HTMLPreElement>('#compare-output')
const selectedImageEl = getEl<HTMLParagraphElement>('#selected-image')
const previewImageEl = getEl<HTMLImageElement>('#preview-image')
const pickImageButton = getEl<HTMLButtonElement>('#pick-image')
const runRendererButton = getEl<HTMLButtonElement>('#run-renderer')
const runMainButton = getEl<HTMLButtonElement>('#run-main')
const runCompareButton = getEl<HTMLButtonElement>('#run-compare')

function getEl<T extends Element>(selector: string) {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`Missing element: ${selector}`)
  }
  return element as T
}

async function getRendererOcr() {
  if (!rendererOcrPromise) {
    rendererStatusEl.textContent = 'Loading bundled models in renderer...'
    rendererOcrPromise = createRendererOcr()
  }
  return await rendererOcrPromise
}

async function createRendererOcr() {
  return await Ocr.create({
    onnxOptions: {
      executionProviders: ['wasm'],
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

async function runRendererDetection(imageUrl: string): Promise<BenchmarkDetection> {
  const ocr = await getRendererOcr()
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

async function runRendererBenchmark({ imagePath, imageUrl, iterations }: { imagePath?: string; imageUrl: string; iterations: number }): Promise<BenchmarkResult> {
  const durationsMs: number[] = []
  let latestResult: BenchmarkDetection | undefined
  const resolvedImageUrl = await resolveRendererImageUrl({ imagePath, imageUrl })
  for (let index = 0; index < iterations; index += 1) {
    latestResult = await runRendererDetection(resolvedImageUrl)
    durationsMs.push(latestResult.durationMs)
  }

  return {
    mode: 'renderer',
    iterations,
    averageDurationMs: durationsMs.reduce((sum, value) => sum + value, 0) / durationsMs.length,
    durationsMs,
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
  runRendererButton.disabled = false
  runMainButton.disabled = false
  runCompareButton.disabled = false
}

async function handleRunRenderer() {
  rendererStatusEl.textContent = 'Running renderer OCR...'
  const detection = await runRendererDetection(selectedImageUrl)
  rendererStatusEl.textContent = 'Renderer OCR complete'
  rendererOutputEl.textContent = toDetectionOutput(detection)
}

async function handleRunMain() {
  mainStatusEl.textContent = 'Running OCR in the main process...'
  const detection = await window.electronOcr.detectInMain(selectedImagePath)
  mainStatusEl.textContent = 'Main-thread OCR complete'
  mainOutputEl.textContent = toDetectionOutput(detection)
}

async function handleCompare() {
  compareOutputEl.textContent = 'Benchmarking both modes...'
  const [rendererResult, mainResult] = await Promise.all([
    runRendererBenchmark({ imageUrl: selectedImageUrl, iterations: 3 }),
    Promise.all([
      window.electronOcr.detectInMain(selectedImagePath),
      window.electronOcr.detectInMain(selectedImagePath),
      window.electronOcr.detectInMain(selectedImagePath),
    ]),
  ])

  const mainDurations = mainResult.map((result) => result.durationMs)
  const mainAverage = mainDurations.reduce((sum, value) => sum + value, 0) / mainDurations.length

  rendererOutputEl.textContent = rendererResult.texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`).join('\n')
  mainOutputEl.textContent = mainResult[0].texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`).join('\n')

  compareOutputEl.textContent = [
    `Renderer average: ${rendererResult.averageDurationMs.toFixed(1)}ms`,
    `Main average: ${mainAverage.toFixed(1)}ms`,
    `Delta: ${(rendererResult.averageDurationMs - mainAverage).toFixed(1)}ms`,
    `Renderer runs: ${rendererResult.durationsMs.map((value) => value.toFixed(1)).join(', ')}`,
    `Main runs: ${mainDurations.map((value) => value.toFixed(1)).join(', ')}`,
  ].join('\n')
}

pickImageButton.addEventListener('click', () => {
  void chooseImage()
})

runRendererButton.addEventListener('click', () => {
  void handleRunRenderer()
})

runMainButton.addEventListener('click', () => {
  void handleRunMain()
})

runCompareButton.addEventListener('click', () => {
  void handleCompare()
})

window.runRendererBenchmark = runRendererBenchmark