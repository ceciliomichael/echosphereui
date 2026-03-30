import { DEFAULT_TERMINAL_WORKSPACE_KEY } from "./chatWorkspaceUiState.types";

export function toWorkspaceScopedKey(workspacePath: string | null) {
  const normalizedPath = workspacePath?.trim() ?? "";
  if (normalizedPath.length === 0) {
    return DEFAULT_TERMINAL_WORKSPACE_KEY;
  }

  return normalizedPath;
}

export function normalizeWorkspaceRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, "/");
}

export function isWorkspacePathWithinTarget(
  entryPath: string,
  targetPath: string,
) {
  const normalizedEntryPath = normalizeWorkspaceRelativePath(entryPath);
  const normalizedTargetPath = normalizeWorkspaceRelativePath(targetPath);
  return (
    normalizedEntryPath === normalizedTargetPath ||
    normalizedEntryPath.startsWith(`${normalizedTargetPath}/`)
  );
}
