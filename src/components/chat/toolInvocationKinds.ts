const FILE_WRITE_TOOL_NAMES = new Set(['apply', 'write'])

export function isFileWriteTool(toolName: string) {
  return FILE_WRITE_TOOL_NAMES.has(toolName)
}

export function isFileEditTool(toolName: string) {
  return toolName === 'apply_patch'
}

export function isFileMutationTool(toolName: string) {
  return isFileWriteTool(toolName) || isFileEditTool(toolName)
}
