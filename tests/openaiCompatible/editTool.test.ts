import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { editTool } from '../../electron/chat/openaiCompatible/tools/editTool'
import { OpenAICompatibleToolError } from '../../electron/chat/openaiCompatible/toolTypes'

function buildExecutionContext(agentContextRootPath: string) {
  const abortController = new AbortController()
  return {
    agentContextRootPath,
    signal: abortController.signal,
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

test('edit tool applies whitespace-tolerant fallback when exact old_string does not match', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'component.tsx')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(
      filePath,
      [
        'if   (enabled)   {',
        '  runTask()',
        '}',
      ].join('\n'),
      'utf8',
    )

    const result = await editTool.execute(
      {
        absolute_path: filePath,
        new_string: 'if (enabled && ready) {',
        old_string: 'if (enabled) {',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'edit')
    assert.equal(result.replacementCount, 1)

    const updated = await fs.readFile(filePath, 'utf8')
    assert.match(updated, /if \(enabled && ready\) \{/u)
  })
})

test('edit tool keeps ambiguity guard for whitespace-tolerant matches', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'ambiguous.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(
      filePath,
      [
        'if   (enabled)   {',
        '  runTask()',
        '}',
        '',
        'if\t(enabled)   {',
        '  runTask()',
        '}',
      ].join('\n'),
      'utf8',
    )

    await assert.rejects(
      () =>
        editTool.execute(
          {
            absolute_path: filePath,
            new_string: 'if (enabled && ready) {',
            old_string: 'if (enabled) {',
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /multiple whitespace-tolerant locations/u)
        return true
      },
    )
  })
})

test('edit tool ignores start_line/end_line and still enforces ambiguity guard', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'scoped.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(
      filePath,
      [
        'const target = true',
        'const keep = 1',
        'const target = true',
      ].join('\n'),
      'utf8',
    )

    await assert.rejects(
      () =>
        editTool.execute(
          {
            absolute_path: filePath,
            end_line: 3,
            new_string: 'const target = false',
            old_string: 'const target = true',
            start_line: 3,
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.equal(error.details?.whyRejected, 'ambiguous_match')
        assert.match(error.message, /matched multiple locations/u)
        return true
      },
    )
  })
})

test('edit tool returns noop when new_string is already present', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'noop.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    const originalContent = ['const keep = 1', 'const target = false', 'const done = true'].join('\n')
    await fs.writeFile(filePath, originalContent, 'utf8')

    const result = await editTool.execute(
      {
        absolute_path: filePath,
        end_line: 2,
        new_string: 'const target = false',
        old_string: 'const target = true',
        start_line: 2,
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'noop')
    assert.equal(result.contentChanged, false)
    assert.equal(result.replacementCount, 0)
    const updated = await fs.readFile(filePath, 'utf8')
    assert.equal(updated, originalContent)
  })
})

test('edit tool failure includes structured strategy and candidate range hints', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'hints.ts')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, ['const alpha = 1', 'const beta = 2'].join('\n'), 'utf8')

    await assert.rejects(
      () =>
        editTool.execute(
          {
            absolute_path: filePath,
            end_line: 2,
            new_string: 'const gamma = 3',
            old_string: 'const gamma = 0',
            start_line: 2,
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.equal(error.details?.matchStrategyAttempted, 'exact_then_whitespace_tolerant')
        assert.equal(error.details?.whyRejected, 'no_match_found')
        assert.deepEqual(error.details?.candidateRanges, [{ endLine: 2, startLine: 1 }])
        return true
      },
    )
  })
})

test('edit tool applies indent-flexible fallback for multiline blocks', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'indent-flex.tsx')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(
      filePath,
      [
        'function Demo() {',
        '    if (enabled) {',
        '        doWork()',
        '    }',
        '}',
      ].join('\n'),
      'utf8',
    )

    const result = await editTool.execute(
      {
        absolute_path: filePath,
        new_string: ['if (enabled) {', 'doWork()', 'trackEvent()', '}'].join('\n'),
        old_string: ['if (enabled) {', '  doWork()', '}'].join('\n'),
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(result.ok, true)
    assert.equal(result.operation, 'edit')
    assert.equal(result.replacementCount, 1)
    const updated = await fs.readFile(filePath, 'utf8')
    assert.match(updated, /if \(enabled\) \{\n {4}doWork\(\)\n {4}trackEvent\(\)\n {4}\}/u)
  })
})

test('edit tool rejects ambiguous flexible matches', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const filePath = path.join(workspacePath, 'src', 'indent-ambiguous.tsx')
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(
      filePath,
      [
        'function Demo() {',
        '  if (enabled) {',
        '    doWork()',
        '  }',
        '',
        '  if (enabled) {',
        '    doWork()',
        '  }',
        '}',
      ].join('\n'),
      'utf8',
    )

    await assert.rejects(
      () =>
        editTool.execute(
          {
            absolute_path: filePath,
            new_string: ['if (enabled) {', '  doWork()', '  trackEvent()', '}'].join('\n'),
            old_string: ['if (enabled) {', 'doWork()', '}'].join('\n'),
          },
          buildExecutionContext(workspacePath),
        ),
      (error: unknown) => {
        assert.ok(error instanceof OpenAICompatibleToolError)
        assert.match(error.message, /matched multiple .* locations/u)
        assert.ok(
          error.details?.matchStrategyAttempted === 'whitespace_tolerant' ||
            error.details?.matchStrategyAttempted === 'indent_flexible',
        )
        assert.equal(error.details?.whyRejected, 'ambiguous_match')
        return true
      },
    )
  })
})
