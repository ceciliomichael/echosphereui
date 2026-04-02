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
    assert.match(writtenContent, /\n {2}\{ value: "48%", label: "faster team handoffs" \},/u)
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

test('edit tool matches old_string when tabs and spaces differ in the copied text', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'whitespace.txt')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'foo\tbar\n', 'utf8')

    const result = await editTool.execute(
      {
        absolute_path: filePath,
        new_string: 'baz',
        old_string: 'foo bar',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'edit')
    assert.equal(await fs.readFile(filePath, 'utf8'), 'baz\n')
  })
})

test('edit tool treats identical old_string and new_string as a no-op when the file already matches', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'noop.txt')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['foo', 'bar', 'foo'].join('\n'), 'utf8')

    const result = await editTool.execute(
      {
        absolute_path: filePath,
        new_string: 'foo',
        old_string: 'foo',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'noop')
    assert.equal(result.contentChanged, false)
    assert.deepEqual(result.addedPaths, [])
    assert.deepEqual(result.modifiedPaths, [])
    assert.equal(await fs.readFile(filePath, 'utf8'), ['foo', 'bar', 'foo'].join('\n'))
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

test('edit tool constrains matching with start_line and end_line', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'ranged.txt')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['alpha', 'beta', 'alpha', 'beta'].join('\n'), 'utf8')

    await editTool.execute(
      {
        absolute_path: filePath,
        end_line: 4,
        new_string: 'gamma',
        old_string: 'beta',
        start_line: 3,
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(await fs.readFile(filePath, 'utf8'), ['alpha', 'beta', 'alpha', 'gamma'].join('\n'))
  })
})

test('edit tool emits compact diagnostics when old_string is missing inside a constrained range', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'ranged-miss.txt')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['alpha', 'beta', 'alpha', 'beta'].join('\n'), 'utf8')

    await assert.rejects(
      () =>
        editTool.execute(
          {
            absolute_path: filePath,
            end_line: 2,
            new_string: 'gamma',
            old_string: 'alpha\nbeta\nalpha',
            start_line: 1,
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.equal(error.details?.failureReason, 'old_string_not_found')
        assert.equal(error.details?.filePath, 'src/ranged-miss.txt')
        assert.equal(error.details?.lineRangeStartLine, 1)
        assert.equal(error.details?.lineRangeEndLine, 2)
        assert.equal(typeof error.details?.bestPartialMatchLine, 'number')
        assert.equal(typeof error.details?.bestPartialMatchPrefixLength, 'number')
        return true
      },
    )
  })
})

test('edit tool auto-expands too-small line ranges to fit the requested old_string block', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'range-expand.txt')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['a', 'b', 'c', 'd'].join('\n'), 'utf8')

    await editTool.execute(
      {
        absolute_path: filePath,
        end_line: 3,
        new_string: 'x\ny\nz',
        old_string: 'b\nc\nd\n',
        start_line: 2,
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(await fs.readFile(filePath, 'utf8'), ['a', 'x', 'y', 'z'].join('\n'))
  })
})

test('edit tool fails when constrained range misses the target block location', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'range-fallback.txt')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['alpha', 'beta', 'gamma'].join('\n'), 'utf8')

    await assert.rejects(
      () =>
        editTool.execute(
          {
            absolute_path: filePath,
            end_line: 1,
            new_string: 'delta',
            old_string: 'gamma',
            start_line: 1,
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.equal(error.details?.failureReason, 'old_string_not_found')
        assert.equal(error.details?.lineRangeStartLine, 1)
        assert.equal(error.details?.lineRangeEndLine, 1)
        return true
      },
    )
  })
})
