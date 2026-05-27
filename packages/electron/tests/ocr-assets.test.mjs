import fs from 'node:fs/promises'
import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const packageDir = process.cwd()
const workspaceRoot = path.join(packageDir, '..', '..')
const DebugOutputDir = path.join(workspaceRoot, 'temp', 'electron-ocr-debug')
const DetectionCache = new Map()
let sharpModulePromise
let hasLoggedSharpSkip = false
const electronBinary = path.join(
  packageDir,
  '..',
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
)
const electronArgsPrefix = process.platform === 'linux' ? ['--no-sandbox'] : []

before(async () => {
  await fs.rm(DebugOutputDir, { recursive: true, force: true })
  await fs.mkdir(DebugOutputDir, { recursive: true })
  console.log(`Writing OCR debug images to ${DebugOutputDir}`)
})

async function runMainBenchmarkDetection(imagePath) {
  if (DetectionCache.has(imagePath)) {
    return await DetectionCache.get(imagePath)
  }

  const detectionPromise = runAndRenderMainBenchmarkDetection(imagePath)
  DetectionCache.set(imagePath, detectionPromise)
  return await detectionPromise
}

async function runAndRenderMainBenchmarkDetection(imagePath) {
  const { stdout, stderr } = await execFileAsync(
    electronBinary,
    [...electronArgsPrefix, '.', '--benchmark', imagePath, '--iterations', '1', '--mode', 'main'],
    {
      cwd: packageDir,
      env: getSpawnEnv(),
      maxBuffer: 10 * 1024 * 1024,
      shell: process.platform === 'win32',
    },
  )

  const output = `${stdout}${stderr}`
  const parsed = JSON.parse(extractFirstJsonObject(output))
  assert.ok(parsed.main, 'Expected main benchmark results')
  assert.ok(Array.isArray(parsed.main.texts), 'Expected OCR text lines')
  assert.ok(Array.isArray(parsed.main.rawTexts), 'Expected raw OCR text lines')
  await renderDebugImages(imagePath, parsed.main)
  return parsed.main
}

async function runMainBenchmark(imagePath) {
  const detection = await runMainBenchmarkDetection(imagePath)
  return detection.texts.map((line) => line.text).join('\n')
}

function getSpawnEnv() {
  if (process.platform !== 'win32') {
    return { ...process.env }
  }

  const env = {}
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('=')) {
      continue
    }
    env[key] = process.env[key]
  }
  return env
}

async function getSharpModule() {
  if (!sharpModulePromise) {
    sharpModulePromise = import('sharp')
      .then((module) => module.default)
      .catch(() => null)
  }

  return await sharpModulePromise
}

function escapeSvgText(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function getDebugImagePath(imagePath, suffix) {
  const parsedPath = path.parse(imagePath)
  return path.join(DebugOutputDir, `${parsedPath.name}.${suffix}.debug.png`)
}

function getBoxBounds(box) {
  const xValues = box.map(([x]) => x)
  const yValues = box.map(([, y]) => y)
  return {
    left: Math.min(...xValues),
    right: Math.max(...xValues),
    top: Math.min(...yValues),
    bottom: Math.max(...yValues),
  }
}

function toOverlayMarkup(lines, strokeColor, fillColor) {
  return lines
    .filter((line) => Array.isArray(line.box) && line.box.length === 4)
    .map((line) => {
      const bounds = getBoxBounds(line.box)
      const fontSize = Math.max(10, Math.min(16, Math.round((bounds.bottom - bounds.top) * 0.55) || 10))
      const labelWidth = Math.max(bounds.right - bounds.left, Math.ceil(line.text.length * (fontSize * 0.58)))
      const labelTop = Math.max(0, bounds.top - fontSize - 4)
      const polygonPoints = line.box.map(([x, y]) => `${x},${y}`).join(' ')

      return `
      <polygon
        points="${polygonPoints}"
        fill="${fillColor}"
        stroke="${strokeColor}"
        stroke-width="2"
      />
      <rect
        x="${bounds.left}"
        y="${labelTop}"
        width="${labelWidth}"
        height="${fontSize + 4}"
        fill="rgba(15, 23, 42, 0.82)"
      />
      <text
        x="${bounds.left + 4}"
        y="${labelTop + fontSize}"
        fill="#ffffff"
        font-size="${fontSize}"
        font-family="Helvetica, Arial, sans-serif"
      >${escapeSvgText(line.text)}</text>
    `
    })
    .join('')
}

/**
 * Renders OCR bounding-box overlays for both merged `texts` and segment-level
 * `rawTexts` so each asset test run leaves inspectable artifacts behind.
 */
async function renderDebugImages(imagePath, detection) {
  await Promise.all([
    renderDebugImage(imagePath, detection.texts, 'texts', '#ff4d00', 'rgba(255, 196, 0, 0.18)'),
    renderDebugImage(imagePath, detection.rawTexts, 'raw-texts', '#0f766e', 'rgba(45, 212, 191, 0.16)'),
  ])
}

/**
 * Writes a single overlay image for the provided OCR lines.
 */
async function renderDebugImage(imagePath, lines, suffix, strokeColor, fillColor) {
  const sharp = await getSharpModule()
  if (!sharp) {
    if (!hasLoggedSharpSkip) {
      console.warn('Skipping OCR debug image rendering because sharp is not available in this environment')
      hasLoggedSharpSkip = true
    }
    return
  }

  const absoluteImagePath = path.join(packageDir, imagePath)
  const debugImagePath = getDebugImagePath(imagePath, suffix)
  const image = sharp(absoluteImagePath)
  const metadata = await image.metadata()
  const width = metadata.width ?? 0
  const height = metadata.height ?? 0

  assert.ok(width > 0, `Could not determine width for ${imagePath}`)
  assert.ok(height > 0, `Could not determine height for ${imagePath}`)

  const overlay = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${toOverlayMarkup(lines, strokeColor, fillColor)}
    </svg>
  `)

  await image
    .composite([{ input: overlay }])
    .png()
    .toFile(debugImagePath)
}

function extractFirstJsonObject(output) {
  const jsonStart = output.indexOf('{')
  assert.notEqual(jsonStart, -1, `Expected JSON output, got:\n${output}`)

  let depth = 0
  let isInString = false
  let isEscaped = false

  for (let index = jsonStart; index < output.length; index += 1) {
    const character = output[index]

    if (isEscaped) {
      isEscaped = false
      continue
    }

    if (character === '\\') {
      isEscaped = true
      continue
    }

    if (character === '"') {
      isInString = !isInString
      continue
    }

    if (isInString) {
      continue
    }

    if (character === '{') {
      depth += 1
      continue
    }

    if (character === '}') {
      depth -= 1
      if (depth === 0) {
        return output.slice(jsonStart, index + 1)
      }
    }
  }

  assert.fail(`Expected a complete JSON object, got:\n${output}`)
}

test('negative-text fixture keeps inverted login copy detectable', async () => {
  const text = await runMainBenchmark('./test-assets/negative text different sizes.jpeg')

  assert.match(text, /positive text/)
  assert.match(text, /Investing\./)
  assert.match(text, /Simplified/)
  assert.match(text, /Email or Customer Code/)
  assert.match(text, /Forgot Password\?/)
  assert.match(text, /Log in/)
})

test('login-screen fixture detects the LOGIN button label', async () => {
  const detection = await runMainBenchmarkDetection('./test-assets/login-screen.jpeg')
  const texts = detection.texts.map((line) => line.text)
  const rawTexts = detection.rawTexts.map((line) => line.text)

  assert.ok(texts.includes('Repeato Demo App'))
  assert.ok(texts.includes('Secure sign in'))
  assert.ok(texts.includes('Email *'))
  assert.ok(texts.includes('Password *'))
  assert.ok(texts.includes('LOGIN'))
  assert.ok(rawTexts.includes('LOGIN'))
})

test('markets-screen asset OCR extracts expected market labels', async () => {
  const text = await runMainBenchmark('./test-assets/markets-screen.jpeg')
  assert.match(text, /Favorites/)
  assert.match(text, /Many markets,?many opportunities/)
  assert.match(text, /Thai Stocks/)
  assert.match(text, /Global Stocks/)
  assert.match(text, /KBANK 190\.00/)
  assert.match(text, /A\.NYSE 110\.24/)
})

test('studio difficult-word-spacing fixture preserves spaced label', async () => {
  const text = await runMainBenchmark('./test-assets/difficult word spacing.jpeg')

  assert.match(text, /Log in/)
})

test('studio negative-text fixture detects small and large positive text', async () => {
  const text = await runMainBenchmark('./test-assets/negative text different sizes.jpeg')

  assert.match(text, /positive text/)
  assert.match(text, /Bigger positive/)
})

test('studio calendar landscape fixture keeps merged texts but exposes split rawTexts', async () => {
  const detection = await runMainBenchmarkDetection('./test-assets/calendar.jpeg')
  const texts = detection.texts.map((line) => line.text)
  const rawTexts = detection.rawTexts.map((line) => line.text)

  assert.ok(texts.includes('W 19 20 21 22 23 24 25'))
  assert.ok(rawTexts.includes('W'))
  assert.ok(rawTexts.includes('19'))
  assert.ok(rawTexts.includes('25'))
  assert.ok(!rawTexts.includes('19 20 21 22 23 24 25'))
})

test('studio calendar portrait fixture keeps merged date rows and splits raw day tokens', async () => {
  const detection = await runMainBenchmarkDetection('./test-assets/calendar portrait.jpeg')
  const texts = detection.texts.map((line) => line.text)
  const rawTexts = detection.rawTexts.map((line) => line.text)

  assert.ok(texts.includes('19 20 21 22 23 24 25'))
  assert.ok(rawTexts.includes('19'))
  assert.ok(rawTexts.includes('25'))
  assert.ok(!rawTexts.includes('19 20 21 22 23 24 25'))
})

// Unfortunately we can't make this thin font test work yet:
// test('detects thin font face', async () => {
//   const text = await runMainBenchmark('./test-assets/thin type face.jpeg')

//   assert.match(text, /FIBRE DE LA PEAU/)
// })