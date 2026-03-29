import path from "node:path";
import { format } from "prettier";

type LineEnding = "\n" | "\r\n";

const PRETTIER_PARSERS_BY_EXTENSION: Record<string, string> = {
  ".cjs": "babel",
  ".css": "css",
  ".cts": "typescript",
  ".html": "html",
  ".htm": "html",
  ".js": "babel",
  ".jsx": "babel",
  ".json": "json",
  ".jsonc": "jsonc",
  ".md": "markdown",
  ".mdx": "mdx",
  ".mjs": "babel",
  ".mts": "typescript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".yaml": "yaml",
  ".yml": "yaml",
};

function detectLineEnding(content: string): LineEnding {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

function normalizeToLineFeed(content: string) {
  return content.replace(/\r\n/g, "\n");
}

function convertToLineEnding(content: string, lineEnding: LineEnding) {
  return lineEnding === "\n" ? content : content.replace(/\n/g, "\r\n");
}

function resolvePrettierParser(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  return PRETTIER_PARSERS_BY_EXTENSION[extension] ?? null;
}

export async function formatWorkspaceFileContent(
  filePath: string,
  content: string,
  fallbackLineEnding?: LineEnding,
) {
  const sourceLineEnding = fallbackLineEnding ?? detectLineEnding(content);
  const normalizedFallbackContent = convertToLineEnding(
    normalizeToLineFeed(content),
    sourceLineEnding,
  );
  const parser = resolvePrettierParser(filePath);
  if (!parser) {
    return normalizedFallbackContent;
  }

  try {
    const formattedContent = await format(content, {
      filepath: filePath,
      parser,
    });

    return convertToLineEnding(
      normalizeToLineFeed(formattedContent),
      sourceLineEnding,
    );
  } catch {
    return normalizedFallbackContent;
  }
}
