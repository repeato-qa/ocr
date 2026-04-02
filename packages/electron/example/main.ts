import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import Ocr from '@repeato/ocr'

type BenchmarkMode = 'main' | 'renderer' | 'compare'

type DetectionResult = {
  durationMs: number
  texts: Array<{ text: string; mean: number }>
}

function getMimeType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.bmp':
      return 'image/bmp'
    default:
      return 'application/octet-stream'
  }
}

let mainThreadOcr: Awaited<ReturnType<typeof Ocr.create>> | undefined

function getBuildPath(...parts: string[]) {
  return path.join(app.getAppPath(), 'build', ...parts)
}

function getBundledModels() {
  return {
    detectionPath: getBuildPath('assets', 'ch_PP-OCRv4_det_infer.onnx'),
    recognitionPath: getBuildPath('assets', 'ch_PP-OCRv4_rec_infer.onnx'),
    dictionaryPath: getBuildPath('assets', 'ppocr_keys_v1.txt'),
  }
}

async function getMainThreadOcr() {
  if (!mainThreadOcr) {
    mainThreadOcr = await Ocr.create({
      models: getBundledModels(),
    })
  }
  return mainThreadOcr
}

async function detectInMain(imagePath: string): Promise<DetectionResult> {
  const ocr = await getMainThreadOcr()
  const start = performance.now()
  const result = await ocr.detect(imagePath)
  return {
    durationMs: performance.now() - start,
    texts: result.texts.map(({ text, mean }) => ({ text, mean })),
  }
}

async function createWindow({ show = true } = {}) {
  const win = new BrowserWindow({
    width: 1400,
    height: 980,
    show,
    backgroundColor: '#f4efe6',
    webPreferences: {
      preload: getBuildPath('preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  await win.loadFile(getBuildPath('index.html'))
  return win
}

function parseArgs(argv: string[]) {
  const getValue = (flag: string, fallback?: string) => {
    const index = argv.indexOf(flag)
    if (index === -1) {
      return fallback
    }
    return argv[index + 1] || fallback
  }

  const benchmarkImage = getValue('--benchmark')
  const smokeImage = getValue('--smoke')
  const iterations = Number(getValue('--iterations', '3'))
  const mode = (getValue('--mode', 'compare') as BenchmarkMode)

  return { benchmarkImage, smokeImage, iterations, mode }
}

function shouldUseMainThreadCliMode(args: ReturnType<typeof parseArgs>) {
  return Boolean((args.benchmarkImage || args.smokeImage) && args.mode === 'main')
}

function configureCliMode(args: ReturnType<typeof parseArgs>) {
  if (!shouldUseMainThreadCliMode(args)) {
    return
  }

  app.disableHardwareAcceleration()

  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('disable-gpu')
    app.commandLine.appendSwitch('disable-software-rasterizer')
    app.commandLine.appendSwitch('disable-dev-shm-usage')
  }
}

function formatDetection({ durationMs, texts }: DetectionResult) {
  return [`${durationMs.toFixed(1)}ms`, ...texts.map((line) => `${line.mean.toFixed(2)} ${line.text}`)].join('\n')
}

async function assertReadyAsset(name: string) {
  const modelPath = getBuildPath('assets', name)
  const text = await fs.readFile(modelPath, 'utf8')
  if (text.startsWith('version https://git-lfs.github.com/spec/v1')) {
    throw new Error(`Bundled asset ${name} is still a Git LFS pointer. Download the real model files before running Electron benchmarks.`)
  }
}

async function ensureAssetsReady() {
  await Promise.all([
    assertReadyAsset('ch_PP-OCRv4_det_infer.onnx'),
    assertReadyAsset('ch_PP-OCRv4_rec_infer.onnx'),
    assertReadyAsset('ppocr_keys_v1.txt'),
  ])
}

async function runRendererBenchmark(win: BrowserWindow, imagePath: string, iterations: number) {
  const imageUrl = `file://${imagePath}`
  const response = await win.webContents.executeJavaScript(`
    (async () => {
      try {
        if (typeof window.runRendererBenchmark !== 'function') {
          throw new Error('window.runRendererBenchmark is not available')
        }
        const result = await window.runRendererBenchmark(${JSON.stringify({ imagePath, imageUrl, iterations })})
        return { ok: true, result }
      } catch (error) {
        return {
          ok: false,
          error: {
            name: error?.name ?? 'Error',
            message: error?.message ?? String(error),
            stack: error?.stack ?? '',
          },
        }
      }
    })()
  `)

  if (!response?.ok) {
    throw new Error(response?.error?.message || 'Renderer benchmark failed')
  }

  return response.result
}

async function runMainBenchmark(imagePath: string, iterations: number) {
  const durationsMs: number[] = []
  let lastDetection: DetectionResult | undefined
  for (let index = 0; index < iterations; index += 1) {
    lastDetection = await detectInMain(imagePath)
    durationsMs.push(lastDetection.durationMs)
  }
  return {
    mode: 'main',
    iterations,
    averageDurationMs: durationsMs.reduce((sum, value) => sum + value, 0) / durationsMs.length,
    durationsMs,
    texts: lastDetection?.texts || [],
  }
}

async function runCliMode(args: ReturnType<typeof parseArgs>) {
  const imagePath = args.benchmarkImage || args.smokeImage
  if (!imagePath) {
    return false
  }

  await ensureAssetsReady()

  if (args.smokeImage) {
    if (args.mode === 'main') {
      const result = await detectInMain(imagePath)
      if (!result.texts.length) {
        throw new Error('Main thread OCR returned no text lines.')
      }
      console.log(formatDetection(result))
      app.exit(0)
      return true
    }

    const win = await createWindow({ show: false })
    const rendererResult = await runRendererBenchmark(win, imagePath, 1)
    if (!rendererResult.texts.length) {
      throw new Error('Renderer OCR returned no text lines.')
    }
    if (args.mode !== 'renderer') {
      const mainResult = await detectInMain(imagePath)
      if (!mainResult.texts.length) {
        throw new Error('Main thread OCR returned no text lines.')
      }
      console.log(JSON.stringify({ renderer: rendererResult, main: mainResult }, null, 2))
    } else {
      console.log(JSON.stringify(rendererResult, null, 2))
    }
    win.destroy()
    app.exit(0)
    return true
  }

  const win = await createWindow({ show: false })

  const benchmarkResults: Record<string, unknown> = {}
  if (args.mode === 'renderer' || args.mode === 'compare') {
    benchmarkResults.renderer = await runRendererBenchmark(win, imagePath, args.iterations)
  }
  if (args.mode === 'main' || args.mode === 'compare') {
    benchmarkResults.main = await runMainBenchmark(imagePath, args.iterations)
  }

  console.log(JSON.stringify(benchmarkResults, null, 2))
  win.destroy()
  app.exit(0)
  return true
}

async function main() {
  const args = parseArgs(process.argv)

  configureCliMode(args)

  ipcMain.handle('ocr:detect-main', async (_event, imagePath: string) => {
    return await detectInMain(imagePath)
  })

  ipcMain.handle('ocr:load-asset', async (_event, name: string) => {
    const file = await fs.readFile(getBuildPath('assets', name))
    return new Uint8Array(file)
  })

  ipcMain.handle('ocr:load-image-data-url', async (_event, imagePath: string) => {
    const file = await fs.readFile(imagePath)
    return `data:${getMimeType(imagePath)};base64,${file.toString('base64')}`
  })

  ipcMain.handle('ocr:open-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp'],
        },
      ],
    })

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    const imagePath = result.filePaths[0]
    return {
      imagePath,
      imageUrl: pathToFileURL(imagePath).toString(),
    }
  })

  await app.whenReady()

  if (await runCliMode(args)) {
    return
  }

  await createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  app.exit(1)
})