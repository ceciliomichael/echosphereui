import { memo } from 'react'
import { getPathBasename } from '../../lib/pathPresentation'

interface PathLabelProps {
  path: string
  className?: string
}

function getParentPath(path: string) {
  const normalizedPath = path.replace(/\\/g, '/')
  const basename = getPathBasename(normalizedPath)

  if (basename === normalizedPath) {
    return ''
  }

  return normalizedPath.slice(0, normalizedPath.length - basename.length)
}

export const PathLabel = memo(function PathLabel({ path, className = '' }: PathLabelProps) {
  const normalizedPath = path.replace(/\\/g, '/')
  const basename = getPathBasename(normalizedPath)
  const parentPath = getParentPath(normalizedPath)

  if (parentPath.length === 0) {
    return (
      <span className={className} title={normalizedPath}>
        {basename}
      </span>
    )
  }

  return (
    <span className={`inline-flex min-w-0 items-center ${className}`.trim()} title={normalizedPath}>
      <span className="min-w-0 flex-1 truncate text-right">{parentPath}</span>
      <span className="shrink-0">{basename}</span>
    </span>
  )
})
