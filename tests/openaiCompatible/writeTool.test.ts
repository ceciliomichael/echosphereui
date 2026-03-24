import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { writeTool } from '../../electron/chat/openaiCompatible/tools/write/index'
import { OpenAICompatibleToolError } from '../../electron/chat/openaiCompatible/toolTypes'

function buildExecutionContext(agentContextRootPath: string) {
  const abortController = new AbortController()
  return {
    agentContextRootPath,
    signal: abortController.signal,
    workspaceCheckpointId: null,
  }
}

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-write-tool-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('write tool creates a new file when missing', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetFilePath = path.join(workspacePath, 'src', 'new-file.ts')

    const result = await writeTool.execute(
      {
        absolute_path: targetFilePath,
        content: 'export const value = 1\n',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.operation, 'write')
    assert.equal(result.contentChanged, true)
    assert.deepEqual(result.addedPaths, ['src/new-file.ts'])
    assert.deepEqual(result.modifiedPaths, [])
    assert.equal(result.path, 'src/new-file.ts')
    assert.equal(await fs.readFile(targetFilePath, 'utf8'), 'export const value = 1;\n')
  })
})

test('write tool formats multiline source files before writing them', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetFilePath = path.join(workspacePath, 'src', 'app', 'page.tsx')

    const result = await writeTool.execute(
      {
        absolute_path: targetFilePath,
        content:
          'import { ArrowRight, BarChart3, CheckCircle2, ShieldCheck } from "lucide-react";\n\nconst metrics = [{ value: "48%", label: "faster team handoffs" }, { value: "12h", label: "saved every week" }, { value: "99.9%", label: "task visibility" }];\n\nexport default function Page(){return <main><section><h1>Welcome to EchoSphere</h1><p>Build faster with the workspace formatter.</p></section></main>}\n',
      },
      buildExecutionContext(workspacePath),
    )

    const writtenContent = await fs.readFile(targetFilePath, 'utf8')
    assert.equal(result.operation, 'write')
    assert.equal(result.contentChanged, true)
    assert.match(writtenContent, /const metrics = \[/u)
    assert.match(writtenContent, /\n  \{ value: "48%", label: "faster team handoffs" \},/u)
    assert.match(writtenContent, /export default function Page\(\) \{/u)
    assert.match(writtenContent, /return \(/u)
    assert.match(writtenContent, /<section>/u)
    assert.match(writtenContent, /<p>Build faster with the workspace formatter\.<\/p>/u)
    assert.match(writtenContent, /\n\}\n?$/u)
  })
})

test('write tool overwrites existing files and exposes prior content', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const targetFilePath = path.join(workspacePath, 'src', 'existing-file.ts')
    await fs.mkdir(path.dirname(targetFilePath), { recursive: true })
    await fs.writeFile(targetFilePath, 'export const value = 1\n', 'utf8')

    const result = await writeTool.execute(
      {
        absolute_path: targetFilePath,
        content: 'export const value = 2\n',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.operation, 'write')
    assert.deepEqual(result.addedPaths, [])
    assert.deepEqual(result.modifiedPaths, ['src/existing-file.ts'])
    assert.equal(result.oldContent, 'export const value = 1\n')
    assert.equal(result.newContent, 'export const value = 2;\n')
    assert.equal(await fs.readFile(targetFilePath, 'utf8'), 'export const value = 2;\n')
  })
})

test('write tool rejects paths outside the locked root', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await withTemporaryDirectory(async (outsidePath) => {
      const outsideFilePath = path.join(outsidePath, 'outside.ts')

      await assert.rejects(
        writeTool.execute(
          {
            absolute_path: outsideFilePath,
            content: 'export {}\n',
          },
          buildExecutionContext(workspacePath),
        ),
        (error: unknown) => {
          assert.ok(error instanceof OpenAICompatibleToolError)
          assert.match(error.message, /locked root directory/u)
          return true
        },
      )
    })
  })
})
