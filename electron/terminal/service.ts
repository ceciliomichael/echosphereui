import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { shell, type IpcMainInvokeEvent, type WebContents } from "electron";
import { spawn, type IPty } from "node-pty";
import type {
  CloseTerminalSessionInput,
  CreateTerminalSessionInput,
  CreateTerminalSessionResult,
  OpenExternalTerminalLinkInput,
  ResizeTerminalSessionInput,
  TerminalDataEvent,
  TerminalExitEvent,
  WriteTerminalSessionInput,
} from "../../src/types/chat";

const TERMINAL_MIN_COLS = 20;
const TERMINAL_MAX_COLS = 400;
const TERMINAL_MIN_ROWS = 6;
const TERMINAL_MAX_ROWS = 200;
const MAX_SESSION_OUTPUT_BUFFER_LENGTH = 300_000;
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

interface TerminalShellSpec {
  args: string[];
  command: string;
  label: string;
}

interface ActiveTerminalSession {
  cwd: string;
  cwdKey: string;
  outputBuffer: string;
  ownerWebContentsId: number;
  ptyProcess: IPty;
  shellLabel: string;
  workspaceSessionKey: string;
}

const sessions = new Map<number, ActiveTerminalSession>();
const ownerSessionIds = new Map<number, Set<number>>();
const ownerWorkspaceSessions = new Map<number, Map<string, number>>();
const ownersWithCleanup = new Set<number>();
let nextSessionId = 1;

function clampInteger(
  value: number,
  min: number,
  max: number,
  fallback: number,
) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const boundedValue = Math.floor(value);
  if (boundedValue < min) {
    return min;
  }

  if (boundedValue > max) {
    return max;
  }

  return boundedValue;
}

function assertDirectoryExists(directoryPath: string) {
  if (!existsSync(directoryPath)) {
    throw new Error(
      `Terminal working directory does not exist: ${directoryPath}`,
    );
  }

  if (!statSync(directoryPath).isDirectory()) {
    throw new Error(
      `Terminal working directory is not a directory: ${directoryPath}`,
    );
  }
}

function resolveTerminalCwd(cwd: string | null | undefined) {
  const normalizedCwd = cwd?.trim() ?? "";
  if (normalizedCwd.length === 0) {
    return process.cwd();
  }

  const resolvedPath = path.resolve(normalizedCwd);
  assertDirectoryExists(resolvedPath);
  return resolvedPath;
}

function resolveUnixShellSpecs() {
  const fromEnvironment = process.env.SHELL?.trim();
  const shells = [fromEnvironment, "/bin/zsh", "/bin/bash", "/bin/sh"].filter(
    (value): value is string => {
      return typeof value === "string" && value.length > 0;
    },
  );

  return shells.map(
    (shellPath): TerminalShellSpec => ({
      args: ["-l"],
      command: shellPath,
      label: path.basename(shellPath),
    }),
  );
}

function resolveWindowsShellSpecs() {
  const windowsDirectory = process.env.WINDIR?.trim() || "C:\\Windows";
  const programFilesDirectory =
    process.env.ProgramFiles?.trim() || "C:\\Program Files";
  const comSpec = process.env.ComSpec?.trim();
  const windowsPowerShellPath = path.join(
    windowsDirectory,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const pwshPath = path.join(
    programFilesDirectory,
    "PowerShell",
    "7",
    "pwsh.exe",
  );
  const windowsCandidates: TerminalShellSpec[] = [];

  if (existsSync(windowsPowerShellPath)) {
    windowsCandidates.push({
      args: ["-NoLogo", "-NoProfile"],
      command: windowsPowerShellPath,
      label: "PowerShell",
    });
  }

  if (existsSync(pwshPath)) {
    windowsCandidates.push({
      args: ["-NoLogo", "-NoProfile"],
      command: pwshPath,
      label: "PowerShell",
    });
  }

  windowsCandidates.push({
    args: ["-NoLogo", "-NoProfile"],
    command: "powershell.exe",
    label: "PowerShell",
  });
  windowsCandidates.push({
    args: ["-NoLogo", "-NoProfile"],
    command: "pwsh.exe",
    label: "PowerShell",
  });

  if (comSpec && comSpec.length > 0) {
    windowsCandidates.push({
      args: [],
      command: comSpec,
      label: "Command Prompt",
    });
  } else {
    windowsCandidates.push({
      args: [],
      command: "cmd.exe",
      label: "Command Prompt",
    });
  }

  return windowsCandidates;
}

function createTerminalEnvironment() {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: "xterm-256color",
  };
  delete environment.ELECTRON_RUN_AS_NODE;
  return environment;
}

function parseExternalTerminalLink(rawUrl: string) {
  const normalizedUrl = rawUrl.trim();
  if (normalizedUrl.length === 0) {
    throw new Error("A URL is required.");
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalizedUrl);
  } catch (_error) {
    throw new Error("Only absolute URLs are supported.");
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsedUrl.protocol}`);
  }

  return parsedUrl.toString();
}

function resolveShellSpecs() {
  return process.platform === "win32"
    ? resolveWindowsShellSpecs()
    : resolveUnixShellSpecs();
}

function toWorkspaceKey(cwd: string) {
  const normalized = path.normalize(cwd);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function toWorkspaceSessionKey(
  workspaceKey: string,
  sessionKey?: string | null,
) {
  const normalizedSessionKey = sessionKey?.trim() ?? "";
  return normalizedSessionKey.length > 0
    ? `${workspaceKey}::${normalizedSessionKey}`
    : workspaceKey;
}

function appendSessionOutputBuffer(
  activeSession: ActiveTerminalSession,
  chunk: string,
) {
  activeSession.outputBuffer += chunk;
  if (activeSession.outputBuffer.length <= MAX_SESSION_OUTPUT_BUFFER_LENGTH) {
    return;
  }

  const startIndex =
    activeSession.outputBuffer.length - MAX_SESSION_OUTPUT_BUFFER_LENGTH;
  activeSession.outputBuffer = activeSession.outputBuffer.slice(startIndex);
}

function registerSessionWithOwner(
  ownerWebContentsId: number,
  sessionId: number,
) {
  const activeOwnerSessions = ownerSessionIds.get(ownerWebContentsId);
  if (activeOwnerSessions) {
    activeOwnerSessions.add(sessionId);
    return;
  }

  ownerSessionIds.set(ownerWebContentsId, new Set([sessionId]));
}

function unregisterSessionFromOwner(
  ownerWebContentsId: number,
  sessionId: number,
) {
  const activeOwnerSessions = ownerSessionIds.get(ownerWebContentsId);
  if (!activeOwnerSessions) {
    return;
  }

  activeOwnerSessions.delete(sessionId);
  if (activeOwnerSessions.size === 0) {
    ownerSessionIds.delete(ownerWebContentsId);
  }
}

function registerWorkspaceSession(
  ownerWebContentsId: number,
  workspaceKey: string,
  sessionId: number,
) {
  const ownerMappings = ownerWorkspaceSessions.get(ownerWebContentsId);
  if (ownerMappings) {
    ownerMappings.set(workspaceKey, sessionId);
    return;
  }

  ownerWorkspaceSessions.set(
    ownerWebContentsId,
    new Map([[workspaceKey, sessionId]]),
  );
}

function unregisterWorkspaceSession(
  ownerWebContentsId: number,
  workspaceKey: string,
  sessionId: number,
) {
  const ownerMappings = ownerWorkspaceSessions.get(ownerWebContentsId);
  if (!ownerMappings) {
    return;
  }

  const mappedSessionId = ownerMappings.get(workspaceKey);
  if (mappedSessionId === sessionId) {
    ownerMappings.delete(workspaceKey);
  }
  if (ownerMappings.size === 0) {
    ownerWorkspaceSessions.delete(ownerWebContentsId);
  }
}

function findWorkspaceSessionId(
  ownerWebContentsId: number,
  workspaceKey: string,
) {
  const ownerMappings = ownerWorkspaceSessions.get(ownerWebContentsId);
  return ownerMappings?.get(workspaceKey) ?? null;
}

function terminateSession(sessionId: number) {
  const activeSession = sessions.get(sessionId);
  if (!activeSession) {
    return;
  }

  sessions.delete(sessionId);
  unregisterSessionFromOwner(activeSession.ownerWebContentsId, sessionId);
  unregisterWorkspaceSession(
    activeSession.ownerWebContentsId,
    activeSession.workspaceSessionKey,
    sessionId,
  );
  try {
    activeSession.ptyProcess.kill();
  } catch (error) {
    console.warn(`Failed to kill terminal session ${sessionId}`, error);
  }
}

function terminateSessionsForOwner(ownerWebContentsId: number) {
  const activeOwnerSessions = ownerSessionIds.get(ownerWebContentsId);
  if (!activeOwnerSessions) {
    return;
  }

  const sessionIds = Array.from(activeOwnerSessions.values());
  for (const sessionId of sessionIds) {
    terminateSession(sessionId);
  }

  ownerSessionIds.delete(ownerWebContentsId);
  ownerWorkspaceSessions.delete(ownerWebContentsId);
}

function attachOwnerCleanup(sender: WebContents) {
  if (ownersWithCleanup.has(sender.id)) {
    return;
  }

  ownersWithCleanup.add(sender.id);
  sender.once("destroyed", () => {
    ownersWithCleanup.delete(sender.id);
    terminateSessionsForOwner(sender.id);
  });
}

function assertSessionOwnership(ownerWebContentsId: number, sessionId: number) {
  const activeSession = sessions.get(sessionId);
  if (!activeSession) {
    throw new Error(`Unknown terminal session id: ${sessionId}`);
  }

  if (activeSession.ownerWebContentsId !== ownerWebContentsId) {
    throw new Error(
      `Terminal session ${sessionId} does not belong to this window.`,
    );
  }

  return activeSession;
}

function spawnTerminalFromCandidates(input: {
  cols: number;
  cwd: string;
  env: NodeJS.ProcessEnv;
  rows: number;
}) {
  const shellSpecs = resolveShellSpecs();
  const spawnErrors: string[] = [];

  for (const shellSpec of shellSpecs) {
    try {
      const ptyProcess = spawn(shellSpec.command, shellSpec.args, {
        cols: input.cols,
        cwd: input.cwd,
        env: input.env,
        name: "xterm-256color",
        rows: input.rows,
      });

      return {
        ptyProcess,
        shellLabel: shellSpec.label,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      spawnErrors.push(`${shellSpec.command}: ${message}`);
    }
  }

  throw new Error(
    `Failed to start terminal shell. Attempts: ${spawnErrors.join(" | ")}`,
  );
}

function buildCreateSessionResult(input: {
  activeSession: ActiveTerminalSession;
  isReused: boolean;
  sessionId: number;
}): CreateTerminalSessionResult {
  return {
    bufferedOutput: input.activeSession.outputBuffer,
    cwd: input.activeSession.cwd,
    isReused: input.isReused,
    sessionId: input.sessionId,
    shell: input.activeSession.shellLabel,
  };
}

function reuseExistingSession(input: {
  cols: number;
  ownerWebContentsId: number;
  rows: number;
  sessionKey?: string | null;
  workspaceKey: string;
}) {
  const existingSessionId = findWorkspaceSessionId(
    input.ownerWebContentsId,
    toWorkspaceSessionKey(input.workspaceKey, input.sessionKey),
  );
  if (existingSessionId === null) {
    return null;
  }

  const activeSession = sessions.get(existingSessionId);
  if (
    !activeSession ||
    activeSession.ownerWebContentsId !== input.ownerWebContentsId
  ) {
    unregisterWorkspaceSession(
      input.ownerWebContentsId,
      toWorkspaceSessionKey(input.workspaceKey, input.sessionKey),
      existingSessionId,
    );
    return null;
  }

  if (
    activeSession.ptyProcess.cols !== input.cols ||
    activeSession.ptyProcess.rows !== input.rows
  ) {
    activeSession.ptyProcess.resize(input.cols, input.rows);
  }
  return buildCreateSessionResult({
    activeSession,
    isReused: true,
    sessionId: existingSessionId,
  });
}

export async function createTerminalSession(
  event: IpcMainInvokeEvent,
  input: CreateTerminalSessionInput,
): Promise<CreateTerminalSessionResult> {
  attachOwnerCleanup(event.sender);

  const cols = clampInteger(
    input.cols,
    TERMINAL_MIN_COLS,
    TERMINAL_MAX_COLS,
    120,
  );
  const rows = clampInteger(
    input.rows,
    TERMINAL_MIN_ROWS,
    TERMINAL_MAX_ROWS,
    30,
  );
  const cwd = resolveTerminalCwd(input.cwd);
  const workspaceKey = toWorkspaceKey(cwd);
  const workspaceSessionKey = toWorkspaceSessionKey(
    workspaceKey,
    input.sessionKey,
  );
  const reusedSession = reuseExistingSession({
    cols,
    ownerWebContentsId: event.sender.id,
    sessionKey: input.sessionKey,
    rows,
    workspaceKey,
  });
  if (reusedSession) {
    return reusedSession;
  }

  const terminalEnvironment = createTerminalEnvironment();
  const { ptyProcess, shellLabel } = spawnTerminalFromCandidates({
    cols,
    cwd,
    env: terminalEnvironment,
    rows,
  });

  const sessionId = nextSessionId;
  nextSessionId += 1;

  const activeSession: ActiveTerminalSession = {
    cwd,
    cwdKey: workspaceKey,
    outputBuffer: "",
    ownerWebContentsId: event.sender.id,
    ptyProcess,
    shellLabel,
    workspaceSessionKey,
  };
  sessions.set(sessionId, activeSession);
  registerSessionWithOwner(event.sender.id, sessionId);
  registerWorkspaceSession(event.sender.id, workspaceSessionKey, sessionId);

  ptyProcess.onData((data) => {
    const sessionForData = sessions.get(sessionId);
    if (
      !sessionForData ||
      sessionForData.ownerWebContentsId !== event.sender.id ||
      event.sender.isDestroyed()
    ) {
      return;
    }

    appendSessionOutputBuffer(sessionForData, data);
    const payload: TerminalDataEvent = {
      data,
      sessionId,
    };
    event.sender.send("terminal:session:data", payload);
  });

  ptyProcess.onExit((exitEvent) => {
    const sessionForExit = sessions.get(sessionId);
    if (!sessionForExit) {
      return;
    }

    sessions.delete(sessionId);
    unregisterSessionFromOwner(sessionForExit.ownerWebContentsId, sessionId);
    unregisterWorkspaceSession(
      sessionForExit.ownerWebContentsId,
      sessionForExit.workspaceSessionKey,
      sessionId,
    );
    if (!event.sender.isDestroyed()) {
      const payload: TerminalExitEvent = {
        exitCode: exitEvent.exitCode,
        sessionId,
        signal: typeof exitEvent.signal === "number" ? exitEvent.signal : null,
      };
      event.sender.send("terminal:session:exit", payload);
    }
  });

  return buildCreateSessionResult({
    activeSession,
    isReused: false,
    sessionId,
  });
}

export async function writeToTerminalSession(
  event: IpcMainInvokeEvent,
  input: WriteTerminalSessionInput,
) {
  const activeSession = assertSessionOwnership(
    event.sender.id,
    input.sessionId,
  );
  activeSession.ptyProcess.write(input.data);
}

export async function resizeTerminalSession(
  event: IpcMainInvokeEvent,
  input: ResizeTerminalSessionInput,
) {
  const activeSession = assertSessionOwnership(
    event.sender.id,
    input.sessionId,
  );
  const cols = clampInteger(
    input.cols,
    TERMINAL_MIN_COLS,
    TERMINAL_MAX_COLS,
    activeSession.ptyProcess.cols,
  );
  const rows = clampInteger(
    input.rows,
    TERMINAL_MIN_ROWS,
    TERMINAL_MAX_ROWS,
    activeSession.ptyProcess.rows,
  );
  if (
    activeSession.ptyProcess.cols === cols &&
    activeSession.ptyProcess.rows === rows
  ) {
    return;
  }
  activeSession.ptyProcess.resize(cols, rows);
}

export async function closeTerminalSession(
  event: IpcMainInvokeEvent,
  input: CloseTerminalSessionInput,
) {
  assertSessionOwnership(event.sender.id, input.sessionId);
  terminateSession(input.sessionId);
}

export async function openExternalTerminalLink(
  input: OpenExternalTerminalLinkInput,
) {
  const safeUrl = parseExternalTerminalLink(input.url);
  await shell.openExternal(safeUrl);
}

export async function closeAllTerminalSessions() {
  const sessionIds = Array.from(sessions.keys());
  for (const sessionId of sessionIds) {
    terminateSession(sessionId);
  }
}
