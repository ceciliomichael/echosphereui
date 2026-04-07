import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { WorkspaceClipboardEntry } from "./chatWorkspaceUiState.types";
import { isWorkspacePathWithinTarget } from "./chatWorkspaceUiState.utils";

interface ClearWorkspaceClipboardInput {
  setWorkspaceClipboard: Dispatch<
    SetStateAction<WorkspaceClipboardEntry | null>
  >;
}

interface WorkspaceTabsControlInput {
  closeWorkspaceTabsByPathPrefix: (targetPath: string) => void;
  clearWorkspaceClipboardByPathPrefix: (targetPath: string) => void;
}

interface WorkspaceEntryHandlersInput extends WorkspaceTabsControlInput {
  activeWorkspacePathRef: MutableRefObject<string | null>;
  setWorkspaceClipboard: Dispatch<
    SetStateAction<WorkspaceClipboardEntry | null>
  >;
  workspaceClipboard: WorkspaceClipboardEntry | null;
}

function uniqueRelativePaths(relativePaths: readonly string[]) {
  return Array.from(new Set(relativePaths.filter((relativePath) => relativePath.trim().length > 0)))
}

export function createClearWorkspaceClipboardByPathPrefix({
  setWorkspaceClipboard,
}: ClearWorkspaceClipboardInput) {
  return (targetPath: string) => {
    setWorkspaceClipboard((currentClipboard) => {
      if (
        !currentClipboard ||
        !currentClipboard.relativePaths.some((relativePath) =>
          isWorkspacePathWithinTarget(relativePath, targetPath),
        )
      ) {
        return currentClipboard;
      }
      return null;
    });
  };
}

export function createWorkspaceEntryHandlers({
  activeWorkspacePathRef,
  clearWorkspaceClipboardByPathPrefix,
  closeWorkspaceTabsByPathPrefix,
  setWorkspaceClipboard,
  workspaceClipboard,
}: WorkspaceEntryHandlersInput) {
  const handleCreateWorkspaceEntry = async (
    relativePath: string,
    isDirectory: boolean,
  ) => {
    const workspaceRootPath = activeWorkspacePathRef.current;
    if (!workspaceRootPath) {
      throw new Error("Select a workspace folder first.");
    }

    await window.echosphereWorkspace.createEntry({
      isDirectory,
      relativePath,
      workspaceRootPath,
    });
  };

  const handleRenameWorkspaceEntry = async (
    relativePath: string,
    nextRelativePath: string,
  ) => {
    const workspaceRootPath = activeWorkspacePathRef.current;
    if (!workspaceRootPath) {
      throw new Error("Select a workspace folder first.");
    }

    await window.echosphereWorkspace.renameEntry({
      nextRelativePath,
      relativePath,
      workspaceRootPath,
    });
    clearWorkspaceClipboardByPathPrefix(relativePath);
    closeWorkspaceTabsByPathPrefix(relativePath);
  };

  const handleDeleteWorkspaceEntry = async (relativePath: string) => {
    const workspaceRootPath = activeWorkspacePathRef.current;
    if (!workspaceRootPath) {
      throw new Error("Select a workspace folder first.");
    }

    await window.echosphereWorkspace.deleteEntry({
      relativePath,
      workspaceRootPath,
    });
    clearWorkspaceClipboardByPathPrefix(relativePath);
    closeWorkspaceTabsByPathPrefix(relativePath);
  };

  const handleImportWorkspaceEntry = async (
    sourcePath: string,
    targetDirectoryRelativePath: string,
  ) => {
    const workspaceRootPath = activeWorkspacePathRef.current;
    if (!workspaceRootPath) {
      throw new Error("Select a workspace folder first.");
    }

    await window.echosphereWorkspace.importEntry({
      sourcePath,
      targetDirectoryRelativePath,
      workspaceRootPath,
    });
  };

  const handleCopyWorkspaceEntry = async (relativePaths: string[]) => {
    setWorkspaceClipboard({
      mode: "copy",
      relativePaths: uniqueRelativePaths(relativePaths),
    });
  };

  const handleCutWorkspaceEntry = async (relativePaths: string[]) => {
    setWorkspaceClipboard({
      mode: "cut",
      relativePaths: uniqueRelativePaths(relativePaths),
    });
  };

  const handlePasteWorkspaceEntry = async (
    targetDirectoryRelativePath: string,
  ) => {
    const workspaceRootPath = activeWorkspacePathRef.current;
    if (!workspaceRootPath) {
      throw new Error("Select a workspace folder first.");
    }
    if (!workspaceClipboard) {
      throw new Error("Nothing to paste.");
    }

    const relativePaths = uniqueRelativePaths(workspaceClipboard.relativePaths);
    for (const relativePath of relativePaths) {
      const result = await window.echosphereWorkspace.transferEntry({
        mode: workspaceClipboard.mode === "cut" ? "move" : "copy",
        relativePath,
        targetDirectoryRelativePath,
        workspaceRootPath,
      });

      if (
        result.mode === "move" &&
        result.targetRelativePath !== result.relativePath
      ) {
        clearWorkspaceClipboardByPathPrefix(result.relativePath);
        closeWorkspaceTabsByPathPrefix(result.relativePath);
      }
    }
  };

  const handleMoveWorkspaceEntry = async (
    relativePath: string,
    targetDirectoryRelativePath: string,
  ) => {
    const workspaceRootPath = activeWorkspacePathRef.current;
    if (!workspaceRootPath) {
      throw new Error("Select a workspace folder first.");
    }

    const result = await window.echosphereWorkspace.transferEntry({
      mode: "move",
      relativePath,
      targetDirectoryRelativePath,
      workspaceRootPath,
    });

    if (result.targetRelativePath !== result.relativePath) {
      clearWorkspaceClipboardByPathPrefix(result.relativePath);
      closeWorkspaceTabsByPathPrefix(result.relativePath);
    }
  };

  return {
    handleCopyWorkspaceEntry,
    handleCreateWorkspaceEntry,
    handleCutWorkspaceEntry,
    handleDeleteWorkspaceEntry,
    handleImportWorkspaceEntry,
    handleMoveWorkspaceEntry,
    handlePasteWorkspaceEntry,
    handleRenameWorkspaceEntry,
  };
}
