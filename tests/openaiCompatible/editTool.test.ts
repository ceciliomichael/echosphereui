import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { editTool } from '../../electron/chat/openaiCompatible/tools/edit/index'
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
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-edit-tool-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('edit tool can create a new file via replace mode with empty old_string', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'new-file.ts')

    const result = await editTool.execute(
      {
        absolute_path: filePath,
        old_string: '',
        new_string: 'export const value = 1\n',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'edit')
    assert.deepEqual(result.addedPaths, ['src/new-file.ts'])
    assert.deepEqual(result.modifiedPaths, [])
    assert.equal(await fs.readFile(filePath, 'utf8'), 'export const value = 1;\n')
  })
})

test('edit tool formats multiline source files after create-mode edits', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'app', 'page.tsx')

    const result = await editTool.execute(
      {
        absolute_path: filePath,
        old_string: '',
        new_string:
          'import { ArrowRight, BarChart3, CheckCircle2, ShieldCheck } from "lucide-react";\n\nconst metrics = [{ value: "48%", label: "faster team handoffs" }, { value: "12h", label: "saved every week" }, { value: "99.9%", label: "task visibility" }];\n\nexport default function Page(){return <main><section><h1>Welcome to EchoSphere</h1><p>Build faster with the workspace formatter.</p></section></main>}\n',
      },
      buildExecutionContext(workspacePath),
    )

    const writtenContent = await fs.readFile(filePath, 'utf8')

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'edit')
    assert.deepEqual(result.addedPaths, ['src/app/page.tsx'])
    assert.match(writtenContent, /const metrics = \[/u)
    assert.match(writtenContent, /\n  \{ value: "48%", label: "faster team handoffs" \},/u)
    assert.match(writtenContent, /export default function Page\(\) \{/u)
    assert.match(writtenContent, /return \(/u)
    assert.match(writtenContent, /<section>/u)
    assert.match(writtenContent, /<p>Build faster with the workspace formatter\.<\/p>/u)
  })
})

test('edit tool rejects content payloads and requires old_string/new_string', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'invalid.ts')

    await assert.rejects(
      () =>
        editTool.execute(
          {
            absolute_path: filePath,
            content: 'export const value = 1\n',
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /old_string/u)
        return true
      },
    )
  })
})

test('edit tool performs anchored string replacement on existing files', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'component.tsx')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['function Demo() {', '  return null', '}'].join('\n'), 'utf8')

    const result = await editTool.execute(
      {
        absolute_path: filePath,
        new_string: '  return <div />',
        old_string: '  return null',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'edit')
    assert.deepEqual(result.modifiedPaths, ['src/component.tsx'])
    const updated = await fs.readFile(filePath, 'utf8')
    assert.match(updated, /return <div \/>/u)
  })
})

test('edit tool rejects multi-edit operations in a single call', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const onePath = path.join(workspacePath, 'src', 'one.ts')
    const twoPath = path.join(workspacePath, 'src', 'two.ts')
    await fs.mkdir(path.dirname(onePath), { recursive: true })
    await fs.writeFile(onePath, 'export const one = 1\n', 'utf8')
    await fs.writeFile(twoPath, 'export const two = 2\n', 'utf8')

    await assert.rejects(
      () =>
        editTool.execute(
          {
            edits: [
              {
                absolute_path: onePath,
                new_string: 'export const one = 10',
                old_string: 'export const one = 1',
              },
              {
                absolute_path: twoPath,
                new_string: 'export const two = 20',
                old_string: 'export const two = 2',
              },
            ],
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /single operation/u)
        return true
      },
    )
  })
})

test('edit tool preserves CRLF line endings for replace operations', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'windows.txt')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'line1\r\nold\r\nline3\r\n', 'utf8')

    await editTool.execute(
      {
        absolute_path: filePath,
        new_string: 'new',
        old_string: 'old',
      },
      buildExecutionContext(workspacePath),
    )

    const updated = await fs.readFile(filePath, 'utf8')
    assert.equal(updated, 'line1\r\nnew\r\nline3\r\n')
  })
})

test('edit tool rejects ambiguous replacements without replace_all', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'ambiguous.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'foo\nfoo\n', 'utf8')

    await assert.rejects(
      () =>
        editTool.execute(
          {
            absolute_path: filePath,
            new_string: 'bar',
            old_string: 'foo',
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /multiple matches/u)
        return true
      },
    )
  })
})

test('edit tool supports replace_all for repeated occurrences', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'all.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'foo\nfoo\n', 'utf8')

    await editTool.execute(
      {
        absolute_path: filePath,
        new_string: 'bar',
        old_string: 'foo',
        replace_all: true,
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(await fs.readFile(filePath, 'utf8'), 'bar;\nbar;\n')
  })
})

test('edit tool matches old_string copied from numbered read output', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'numbered.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['import x from "x"', 'export default x'].join('\n'), 'utf8')

    await editTool.execute(
      {
        absolute_path: filePath,
        new_string: 'export default y',
        old_string: '2 | export default x',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(await fs.readFile(filePath, 'utf8'), 'import x from "x";\nexport default y;\n')
  })
})
