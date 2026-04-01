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
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
)
const electronArgsPrefix = process.platform === 'linux' ? ['--no-sandbox'] : []

async function runMainBenchmark(imagePath) {
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
  const jsonStart = output.indexOf('{')
  const jsonEnd = output.lastIndexOf('}')
  assert.notEqual(jsonStart, -1, `Expected JSON output, got:\n${output}`)
  assert.notEqual(jsonEnd, -1, `Expected JSON output, got:\n${output}`)

  const parsed = JSON.parse(output.slice(jsonStart, jsonEnd + 1))
  assert.ok(parsed.main, 'Expected main benchmark results')
  assert.ok(Array.isArray(parsed.main.texts), 'Expected OCR text lines')
  return parsed.main.texts.map((line) => line.text).join('\n')
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

test('login-screen asset OCR extracts expected copy', async () => {
  const text = await runMainBenchmark('./test-assets/login-screen.jpeg')

  console.log('Extracted text:', text)
  assert.match(text, /Investing\./)
  assert.match(text, /Simplified/)
  assert.match(text, /Email or Customer Code/)
  assert.match(text, /Forgot Password\?/)
  assert.match(text, /Log in/)
})

test('markets-screen asset OCR extracts expected market labels', async () => {
  const text = await runMainBenchmark('./test-assets/markets-screen.jpeg')
console.log('Extracted text:', text)
  assert.match(text, /Many markets,?many opportunities/)
  assert.match(text, /Thai Stocks/)
  assert.match(text, /Global Stocks/)
  assert.match(text, /KBANK 190\.00/)
  assert.match(text, /A\.NYSE 110\.24/)
})