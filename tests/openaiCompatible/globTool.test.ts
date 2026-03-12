import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { globTool } from '../../electron/chat/openaiCompatible/tools/globTool'
import { buildRipgrepGlobArguments } from '../../electron/chat/openaiCompatible/tools/ripgrepGlobRunner'
import { OpenAICompatibleToolError } from '../../electron/chat/openaiCompatible/toolTypes'

function buildExecutionContext(agentContextRootPath: string) {
  const abortController = new AbortController()
  return {
    agentContextRootPath,
    signal: abortController.signal,
  }
}

function readNumberField(input: Record<string, unknown>, fieldName: string) {
  const value = input[fieldName]
  assert.equal(typeof value, 'number', `${fieldName} must be a number.`)
  return value
}

function readBooleanField(input: Record<string, unknown>, fieldName: string) {
  const value = input[fieldName]
  assert.equal(typeof value, 'boolean', `${fieldName} must be a boolean.`)
  return value
}

function readMatches(input: Record<string, unknown>) {
  const matches = input.matches
  assert.ok(Array.isArray(matches), 'matches must be an array.')
  return matches as string[]
}

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-glob-tool-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('buildRipgrepGlobArguments constructs expected args', () => {
  const argumentsList = buildRipgrepGlobArguments({
    globPattern: '**/*.ts',
    searchPath: '/tmp/workspace',
  })

  assert.deepEqual(argumentsList, [
    '--files',
    '--no-config',
    '--no-require-git',
    '--glob',
    '**/*.ts',
    '/tmp/workspace',
  ])
})

test('glob tool returns matching files for the glob pattern', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, 'src', 'index.ts'), 'export {}', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'src', 'util.ts'), 'export {}', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'src', 'styles.css'), ':root{}', 'utf8')

    const result = await globTool.execute(
      {
        absolute_path: workspacePath,
        pattern: '**/*.ts',
      },
      buildExecutionContext(workspacePath),
    )
    const matches = readMatches(result)
    const matchedPaths = new Set(matches)

    assert.equal(matchedPaths.has('src/index.ts'), true)
    assert.equal(matchedPaths.has('src/util.ts'), true)
  })
})

test('glob tool respects .gitignore', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.writeFile(path.join(workspacePath, '.gitignore'), 'ignored.ts\n', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'ignored.ts'), 'export {}', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'visible.ts'), 'export {}', 'utf8')

    const result = await globTool.execute(
      {
        absolute_path: workspacePath,
        pattern: '**/*.ts',
      },
      buildExecutionContext(workspacePath),
    )
    const matches = readMatches(result)

    assert.equal(matches.length, 1)
    assert.equal(matches[0], 'visible.ts')
  })
})

test('glob tool truncates results at max_results', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.mkdir(path.join(workspacePath, 'src'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, 'src', 'a.ts'), '', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'src', 'b.ts'), '', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'src', 'c.ts'), '', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'src', 'd.ts'), '', 'utf8')

    const result = await globTool.execute(
      {
        absolute_path: workspacePath,
        max_results: 2,
        pattern: '**/*.ts',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(readMatches(result).length, 2)
    assert.equal(readBooleanField(result, 'truncated'), true)
  })
})

test('glob tool rejects paths outside the locked root', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await withTemporaryDirectory(async (outsidePath) => {
      await fs.writeFile(path.join(outsidePath, 'outside.ts'), 'export {}', 'utf8')

      await assert.rejects(
        globTool.execute(
          {
            absolute_path: outsidePath,
            pattern: '**/*.ts',
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
