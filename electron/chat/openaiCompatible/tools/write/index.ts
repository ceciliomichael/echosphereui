import { promises as fs } from "node:fs";
import path from "node:path";
import type { OpenAICompatibleToolDefinition } from "../../toolTypes";
import { OpenAICompatibleToolError } from "../../toolTypes";
import {
  parseToolArguments,
  readRequiredString,
  readRequiredText,
  resolveToolPath,
  toDisplayPath,
} from "../filesystemToolUtils";
import { getToolDescription } from "../descriptionCatalog";
import { formatWorkspaceFileContent } from "../workspaceFileFormatter";
import { captureWorkspaceCheckpointFileState } from "../../../../workspace/checkpoints";

const TOOL_DESCRIPTION = getToolDescription("write");
type LineEnding = "\n" | "\r\n";

function normalizeToLineFeed(content: string) {
  return content.replace(/\r\n/g, "\n");
}

function convertToLineEnding(content: string, lineEnding: LineEnding) {
  return lineEnding === "\n" ? content : content.replace(/\n/g, "\r\n");
}

async function readExistingContent(absolutePath: string) {
  try {
    const fileStats = await fs.stat(absolutePath);
    if (!fileStats.isFile()) {
      throw new OpenAICompatibleToolError(
        "absolute_path must point to a file for write.",
        {
          absolutePath,
        },
      );
    }

    return {
      exists: true,
      previousContent: await fs.readFile(absolutePath, "utf8"),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        exists: false,
        previousContent: null,
      };
    }

    throw error;
  }
}

export const writeTool: OpenAICompatibleToolDefinition = {
  executionMode: "path-exclusive",
  name: "write",
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, "absolute_path");
    const content = readRequiredText(argumentsValue, "content");
    const { normalizedTargetPath, relativePath } = resolveToolPath(
      context.agentContextRootPath,
      absolutePath,
    );
    const existing = await readExistingContent(normalizedTargetPath);
    const targetLineEnding: LineEnding = existing.previousContent?.includes(
      "\r\n",
    )
      ? "\r\n"
      : "\n";
    const normalizedContent = convertToLineEnding(
      normalizeToLineFeed(content),
      targetLineEnding,
    );

    if (context.workspaceCheckpointId) {
      await captureWorkspaceCheckpointFileState(
        context.workspaceCheckpointId,
        normalizedTargetPath,
      );
    }

    const formattedContent = await formatWorkspaceFileContent(
      normalizedTargetPath,
      normalizedContent,
      targetLineEnding,
    );

    await fs.mkdir(path.dirname(normalizedTargetPath), { recursive: true });
    await fs.writeFile(normalizedTargetPath, formattedContent, "utf8");

    const displayPath = toDisplayPath(relativePath);
    const contentChanged = existing.previousContent !== formattedContent;

    return {
      addedPaths: existing.exists ? [] : [displayPath],
      contentChanged,
      deletedPaths: [],
      endLineNumber: undefined,
      message: existing.exists
        ? `Wrote ${displayPath} successfully.`
        : `Created ${displayPath} successfully.`,
      modifiedPaths: existing.exists ? [displayPath] : [],
      newContent: formattedContent,
      oldContent: existing.previousContent,
      ok: true,
      operation: "write",
      path: displayPath,
      startLineNumber: undefined,
      targetKind: "file",
    };
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: "write",
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: "Absolute file path to write.",
            type: "string",
          },
          content: {
            description: "Full content to write to the target file.",
            type: "string",
          },
        },
        required: ["absolute_path", "content"],
        type: "object",
      },
    },
    type: "function",
  },
};
