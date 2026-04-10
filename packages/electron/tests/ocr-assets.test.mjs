import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const packageDir = process.cwd()
const electronBinary = path.join(
  packageDir,
  '..',
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
)
const electronArgsPrefix = process.platform === 'linux' ? ['--no-sandbox'] : []

async function runMainBenchmarkDetection(imagePath) {
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

test('login-screen asset OCR extracts expected copy', async () => {
  const text = await runMainBenchmark('./test-assets/negative text different sizes.jpeg')

  assert.match(text, /positive text/)
  assert.match(text, /Investing\./)
  assert.match(text, /Simplified/)
  assert.match(text, /Email or Customer Code/)
  assert.match(text, /Forgot Password\?/)
  assert.match(text, /Log in/)
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