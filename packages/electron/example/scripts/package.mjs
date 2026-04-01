import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(rootDir, '..')
const workspaceRoot = path.resolve(packageDir, '../../..')
const tempRoot = path.join(workspaceRoot, 'temp', 'electron-example-package')
const stageDir = path.join(tempRoot, 'stage')
const distDir = path.join(tempRoot, 'dist')
const packageJson = JSON.parse(await fs.readFile(path.join(packageDir, 'package.json'), 'utf8'))
const nodePackageJson = JSON.parse(await fs.readFile(path.join(workspaceRoot, 'packages', 'node', 'package.json'), 'utf8'))

const platform = process.platform
const arch = process.arch
const productName = 'gutenOCR'
const executableName = 'gutenOCR'
const electronVersion = resolveElectronVersion(packageJson.dependencies.electron)

await fs.rm(stageDir, { recursive: true, force: true })
await fs.mkdir(stageDir, { recursive: true })
await fs.mkdir(distDir, { recursive: true })

await fs.cp(path.join(packageDir, 'build'), path.join(stageDir, 'build'), { recursive: true })
await fs.writeFile(
  path.join(stageDir, 'package.json'),
  JSON.stringify(
    {
      name: 'gutenocr-electron-example-app',
      productName,
      private: true,
      version: packageJson.version ?? '0.0.0',
      main: './build/main.cjs',
      dependencies: {
        'onnxruntime-node': nodePackageJson.dependencies['onnxruntime-node'],
        sharp: nodePackageJson.dependencies.sharp,
      },
    },
    null,
    2,
  ) + '\n',
)

run(
  'npm',
  ['install', '--omit=dev', '--package-lock=false'],
  {
    cwd: stageDir,
    env: getSpawnEnv(),
  },
  'Install staged production dependencies',
)

run(
  'npx',
  [
    'electron-rebuild',
    '--force',
    '--version',
    electronVersion,
    '--module-dir',
    stageDir,
    '--only',
    'sharp,onnxruntime-node',
  ],
  {
    cwd: packageDir,
    env: getSpawnEnv(),
  },
  'Rebuild native Electron dependencies',
)

run(
  'npx',
  [
    '@electron/packager',
    stageDir,
    productName,
    '--out',
    distDir,
    '--overwrite',
    '--platform',
    platform,
    '--arch',
    arch,
    '--electron-version',
    electronVersion,
    '--executable-name',
    executableName,
    '--prune=false',
  ],
  {
    cwd: packageDir,
    env: getSpawnEnv(),
  },
  'Package Electron application',
)

const packagedAppDir = path.join(distDir, `${productName}-${platform}-${arch}`)
await fs.writeFile(
  path.join(tempRoot, 'metadata.json'),
  JSON.stringify(
    {
      platform,
      arch,
      productName,
      executableName,
      electronVersion,
      packagedAppDir,
    },
    null,
    2,
  ) + '\n',
)

console.log(JSON.stringify({ packagedAppDir, platform, arch, electronVersion }, null, 2))

function resolveElectronVersion(versionRange) {
  const match = String(versionRange).match(/\d+\.\d+\.\d+/)
  if (!match) {
    throw new Error(`Could not resolve an Electron version from ${String(versionRange)}`)
  }
  return match[0]
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

function run(command, args, options, title) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${title} failed with exit code ${String(result.status)}`)
  }
}