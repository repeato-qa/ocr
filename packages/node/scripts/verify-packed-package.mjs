import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaceRoot = path.resolve(packageDir, '../..')
const verifyDir = path.join(workspaceRoot, 'temp', 'npm-release-check')
const fixturePath = path.join(workspaceRoot, '..', 'app', 'test', 'resources', 'ocr', 'negative text in big image.jpeg')
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'

async function run(command, args, cwd) {
  const result = await execFileAsync(command, args, {
    cwd,
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  })

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  return result.stdout.trim()
}

let tarballPath = ''

try {
  await fs.rm(verifyDir, { recursive: true, force: true })
  await fs.mkdir(verifyDir, { recursive: true })

  const packOutput = await run(npmCommand, ['pack', '--json'], packageDir)
  const [{ filename }] = JSON.parse(packOutput)
  tarballPath = path.join(packageDir, filename)

  await run(npmCommand, ['init', '-y'], verifyDir)
  await run(npmCommand, ['install', tarballPath, 'sharp@0.34.5', '--legacy-peer-deps'], verifyDir)

  const verifyProgram = [
    `const fixturePath = ${JSON.stringify(fixturePath)}`,
    "const pkg = await import('@repeato/ocr')",
    "const electron = await import('@repeato/ocr/electron')",
    "const { default: sharp } = await import('sharp')",
    "if (typeof pkg.default?.create !== 'function') throw new Error('Missing default create() on @repeato/ocr')",
    "if (typeof electron.default?.create !== 'function') throw new Error('Missing default create() on @repeato/ocr/electron')",
    "const rawImage = await sharp(fixturePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })",
    "const ocr = await pkg.default.create()",
    'const result = await ocr.detect({ data: rawImage.data, width: rawImage.info.width, height: rawImage.info.height })',
    "if (!Array.isArray(result.texts) || result.texts.length === 0) throw new Error('OCR detect returned no texts')",
    "console.log(JSON.stringify({ defaultCreate: typeof pkg.default.create, electronCreate: typeof electron.default.create, detectedTexts: result.texts.length }, null, 2))",
  ].join('; ')

  const verifyOutput = await run(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      verifyProgram,
    ],
    verifyDir,
  )

  process.stdout.write(`${verifyOutput}\n`)
} finally {
  await fs.rm(verifyDir, { recursive: true, force: true })
  if (tarballPath) {
    await fs.rm(tarballPath, { force: true })
  }
}