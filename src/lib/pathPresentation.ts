function normalizePathSeparators(input: string) {
  return input.replace(/\\/g, '/')
}

function trimTrailingSlash(input: string) {
  return input.replace(/\/+$/u, '')
}

export function getPathBasename(input: string) {
  const normalizedPath = normalizePathSeparators(input)
  const pathSegments = normalizedPath.split('/').filter((segment) => segment.length > 0)
  return pathSegments[pathSegments.length - 1] ?? input
}

export function getPathDirname(input: string) {
  const normalizedPath = normalizePathSeparators(input).replace(/^\.\/+/u, '')
  const pathSegments = normalizedPath.split('/').filter((segment) => segment.length > 0)
  if (pathSegments.length <= 1) {
    return '.'
  }
  return pathSegments.slice(0, -1).join('/')
}

export function getRelativeDisplayPath(rootPath: string, targetPath: string) {
  const normalizedRootPath = trimTrailingSlash(normalizePathSeparators(rootPath).trim())
  const normalizedTargetPath = trimTrailingSlash(normalizePathSeparators(targetPath).trim())

  if (normalizedRootPath.length === 0 || normalizedTargetPath.length === 0) {
    return normalizePathSeparators(targetPath)
  }

  const comparableRootPath = normalizedRootPath.toLowerCase()
  const comparableTargetPath = normalizedTargetPath.toLowerCase()

  if (comparableTargetPath === comparableRootPath) {
    return '.'
  }

  if (!comparableTargetPath.startsWith(`${comparableRootPath}/`)) {
    return normalizedTargetPath
  }

  return normalizedTargetPath.slice(normalizedRootPath.length + 1)
}
