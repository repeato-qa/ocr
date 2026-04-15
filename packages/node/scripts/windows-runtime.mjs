import fs from 'node:fs'
import path from 'node:path'

export const RequiredWindowsRuntimeDlls = ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']
export const OptionalWindowsRuntimeDlls = ['concrt140.dll', 'vcomp140.dll', 'libomp140.x86_64.dll']

/**
 * Returns the runtime subdirectory name for packaged Windows OCR assets.
 *
 * @param {string} arch
 * @returns {string}
 */
export function getWindowsRuntimeDirName(arch = process.arch) {
  return `win32-${arch}`
}

/**
 * Locates the Windows CRT/OpenMP DLLs needed by the ONNX runtime binding.
 *
 * @returns {string[]}
 */
export function resolveWindowsRuntimeDllPaths() {
  if (process.platform !== 'win32') {
    return []
  }

  const candidateDirs = getWindowsRuntimeCandidateDirs()
  /** @type {string[]} */
  const resolved = []
  /** @type {string[]} */
  const missing = []

  for (const dllName of RequiredWindowsRuntimeDlls) {
    const dllPath = findDllInDirs(dllName, candidateDirs)
    if (!dllPath) {
      missing.push(dllName)
      continue
    }
    resolved.push(dllPath)
  }

  if (missing.length > 0) {
    throw new Error(
      `Could not locate required Windows runtime DLLs for OCR packaging: ${missing.join(', ')}. ` +
        'Install the Visual C++ Redistributable or Visual Studio Build Tools, or set VCToolsRedistDir.'
    )
  }

  for (const dllName of OptionalWindowsRuntimeDlls) {
    const dllPath = findDllInDirs(dllName, candidateDirs)
    if (dllPath) {
      resolved.push(dllPath)
    }
  }

  return uniq([
    ...resolved,
    ...collectDllsFromDirs(resolved.map(filePath => path.dirname(filePath))),
  ])
}

/**
 * Copies the Windows runtime DLLs into the provided runtime root directory.
 *
 * @param {string} targetRootDir
 * @param {string} arch
 * @returns {Promise<string[]>}
 */
export async function copyWindowsRuntimeAssets(targetRootDir, arch = process.arch) {
  if (process.platform !== 'win32') {
    return []
  }

  const targetDir = path.join(targetRootDir, getWindowsRuntimeDirName(arch))
  const runtimeDlls = resolveWindowsRuntimeDllPaths()

  await fs.promises.mkdir(targetDir, { recursive: true })
  await Promise.all(
    runtimeDlls.map(filePath => fs.promises.copyFile(filePath, path.join(targetDir, path.basename(filePath))))
  )

  return runtimeDlls.map(filePath => path.join(targetDir, path.basename(filePath)))
}

/**
 * Collects likely Visual C++ runtime directories from official VS redist paths first,
 * then from fallback Microsoft-shipped app directories.
 *
 * @returns {string[]}
 */
function getWindowsRuntimeCandidateDirs() {
  /** @type {string[]} */
  const candidateDirs = []
  const redistDir = process.env.VCToolsRedistDir

  if (redistDir) {
    candidateDirs.push(path.join(redistDir, 'x64', 'Microsoft.VC143.CRT'))
    candidateDirs.push(path.join(redistDir, 'x64', 'Microsoft.VC142.CRT'))
  }

  const visualStudioRoots = uniq([
    process.env.VSINSTALLDIR,
    process.env.VCINSTALLDIR && path.resolve(process.env.VCINSTALLDIR, '..', 'Redist'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft Visual Studio'),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft Visual Studio'),
  ]).filter(dirPath => fs.existsSync(dirPath))

  for (const root of visualStudioRoots) {
    candidateDirs.push(...findRuntimeDirs(root, 6))
  }

  const fallbackRoots = uniq([process.env.ProgramFiles, process.env['ProgramFiles(x86)']]).filter(dirPath => fs.existsSync(dirPath))
  for (const root of fallbackRoots) {
    candidateDirs.push(...findDllContainerDirs(root, 5, RequiredWindowsRuntimeDlls))
  }

  return uniq(candidateDirs).filter(dirPath => fs.existsSync(dirPath))
}

/**
 * @param {string} currentDir
 * @param {number} depthRemaining
 * @returns {string[]}
 */
function findRuntimeDirs(currentDir, depthRemaining) {
  if (depthRemaining < 0) {
    return []
  }

  /** @type {string[]} */
  const results = []
  /** @type {fs.Dirent[]} */
  let entries = []

  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    const nextDir = path.join(currentDir, entry.name)
    if (/^Microsoft\.VC\d+\.CRT$/i.test(entry.name) && /[\\/]x64[\\/]/i.test(nextDir)) {
      results.push(nextDir)
      continue
    }

    results.push(...findRuntimeDirs(nextDir, depthRemaining - 1))
  }

  return results
}

/**
 * @param {string} currentDir
 * @param {number} depthRemaining
 * @param {string[]} dllNames
 * @returns {string[]}
 */
function findDllContainerDirs(currentDir, depthRemaining, dllNames) {
  if (depthRemaining < 0) {
    return []
  }

  /** @type {string[]} */
  const results = []
  /** @type {fs.Dirent[]} */
  let entries = []

  try {
    entries = fs.readdirSync(currentDir, { withFileTypes: true })
  } catch {
    return results
  }

  if (entries.some(entry => entry.isFile() && dllNames.includes(entry.name.toLowerCase()))) {
    results.push(currentDir)
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }

    results.push(...findDllContainerDirs(path.join(currentDir, entry.name), depthRemaining - 1, dllNames))
  }

  return results
}

/**
 * @param {string} dllName
 * @param {string[]} candidateDirs
 * @returns {string | undefined}
 */
function findDllInDirs(dllName, candidateDirs) {
  for (const candidateDir of candidateDirs) {
    const candidatePath = path.join(candidateDir, dllName)
    if (fs.existsSync(candidatePath)) {
      return candidatePath
    }
  }
}

/**
 * @param {string[]} directories
 * @returns {string[]}
 */
function collectDllsFromDirs(directories) {
  /** @type {string[]} */
  const dllPaths = []

  for (const directory of uniq(directories)) {
    /** @type {string[]} */
    let entries = []

    try {
      entries = fs.readdirSync(directory)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.dll')) {
        continue
      }

      dllPaths.push(path.join(directory, entry))
    }
  }

  return dllPaths
}

/**
 * @param {Array<string | undefined | false>} values
 * @returns {string[]}
 */
function uniq(values) {
  /** @type {string[]} */
  const normalized = []

  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      normalized.push(value)
    }
  }

  return [...new Set(normalized)]
}