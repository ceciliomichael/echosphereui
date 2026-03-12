function normalizePathSeparators(input: string) {
  return input.replace(/\\/g, '/')
}

export function getPathBasename(input: string) {
  const normalizedPath = normalizePathSeparators(input)
  const pathSegments = normalizedPath.split('/').filter((segment) => segment.length > 0)
  return pathSegments[pathSegments.length - 1] ?? input
}
