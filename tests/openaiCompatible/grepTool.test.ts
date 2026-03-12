import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { grepTool } from '../../electron/chat/openaiCompatible/tools/grepTool'
import {
  getRipgrepBinaryCandidatePaths,
  resolveRipgrepBinaryPath,
} from '../../electron/chat/openaiCompatible/tools/ripgrepBinary'
import { buildRipgrepArguments } from '../../electron/chat/openaiCompatible/tools/ripgrepRunner'
import { OpenAICompatibleToolError } from '../../electron/chat/openaiCompatible/toolTypes'

interface ToolResultMatch {
  absolutePath: string
  columnNumber: number
  lineNumber: number
  lineText: string
}

function buildExecutionContext(agentContextRootPath: string) {
  const abortController = new AbortController()
  return {
    agentContextRootPath,
    signal: abortController.signal,
  }
}

function readBooleanField(input: Record<string, unknown>, fieldName: string) {
  const value = input[fieldName]
  assert.equal(typeof value, 'boolean', `${fieldName} must be a boolean.`)
  return value
}

function readNumberField(input: Record<string, unknown>, fieldName: string) {
  const value = input[fieldName]
  assert.equal(typeof value, 'number', `${fieldName} must be a number.`)
  return value
}

function readMatches(input: Record<string, unknown>) {
  const matches = input.matches
  assert.ok(Array.isArray(matches), 'matches must be an array.')
  return matches as ToolResultMatch[]
}

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-grep-tool-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('buildRipgrepArguments applies fixed-string and case-insensitive defaults', () => {
  const argumentsList = buildRipgrepArguments({
    caseSensitive: false,
    isRegex: false,
    pattern: 'needle',
    searchPath: '/tmp/workspace',
  })

  assert.ok(argumentsList.includes('--fixed-strings'))
  assert.ok(argumentsList.includes('--ignore-case'))
  assert.ok(argumentsList.includes('--no-require-git'))
  assert.equal(argumentsList.at(-3), '-e')
  assert.equal(argumentsList.at(-2), 'needle')
  assert.equal(argumentsList.at(-1), '/tmp/workspace')
})

test('buildRipgrepArguments omits fixed-string and ignore-case when regex and case-sensitive are enabled', () => {
  const argumentsList = buildRipgrepArguments({
    caseSensitive: true,
    isRegex: true,
    pattern: '^Needle$',
    searchPath: '/tmp/workspace',
  })

  assert.equal(argumentsList.includes('--fixed-strings'), false)
  assert.equal(argumentsList.includes('--ignore-case'), false)
})

test('getRipgrepBinaryCandidatePaths returns deterministic bundled candidates', () => {
  const candidatePaths = getRipgrepBinaryCandidatePaths({
    appRootPath: '/application/root',
    currentWorkingDirectory: '/current/working/directory',
    platform: 'linux',
    resourcesPath: '/application/resources',
  })

  assert.deepEqual(candidatePaths, [
    path.resolve('/application/resources/ripgrep/rg'),
    path.resolve('/application/root/node_modules/@vscode/ripgrep/bin/rg'),
    path.resolve('/current/working/directory/node_modules/@vscode/ripgrep/bin/rg'),
  ])
})

test('resolveRipgrepBinaryPath throws a tool error when bundled binary is missing', async () => {
  const directoryName = `echosphere-missing-ripgrep-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const missingBasePath = path.join(os.tmpdir(), directoryName)

  await assert.rejects(
    resolveRipgrepBinaryPath({
      appRootPath: path.join(missingBasePath, 'app-root'),
      currentWorkingDirectory: path.join(missingBasePath, 'cwd'),
      resourcesPath: path.join(missingBasePath, 'resources'),
    }),
    (error: unknown) => {
      assert.ok(error instanceof OpenAICompatibleToolError)
      assert.match(error.message, /Bundled ripgrep binary is unavailable/u)
      return true
    },
  )
})

test('grep tool respects .gitignore files', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.writeFile(path.join(workspacePath, '.gitignore'), 'ignored.txt\n', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'ignored.txt'), 'needle\n', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'visible.txt'), 'needle\n', 'utf8')

    const result = await grepTool.execute(
      {
        absolute_path: workspacePath,
        max_results: 20,
        pattern: 'needle',
      },
      buildExecutionContext(workspacePath),
    )
    const matches = readMatches(result)

    assert.equal(matches.length, 1)
    assert.equal(matches[0].absolutePath, path.resolve(path.join(workspacePath, 'visible.txt')))
  })
})

test('grep tool supports fixed-string and regex search modes', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const sampleFilePath = path.join(workspacePath, 'sample.txt')
    await fs.writeFile(sampleFilePath, ['foo.bar', 'fooXbar'].join('\n'), 'utf8')

    const fixedResult = await grepTool.execute(
      {
        absolute_path: sampleFilePath,
        case_sensitive: true,
        pattern: 'foo.bar',
      },
      buildExecutionContext(workspacePath),
    )
    const regexResult = await grepTool.execute(
      {
        absolute_path: sampleFilePath,
        case_sensitive: true,
        is_regex: true,
        pattern: 'foo.bar',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(readNumberField(fixedResult, 'matchCount'), 1)
    assert.equal(readNumberField(regexResult, 'matchCount'), 2)
  })
})

test('grep tool truncates results at max_results', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    const sampleFilePath = path.join(workspacePath, 'sample.txt')
    await fs.writeFile(sampleFilePath, ['needle', 'needle', 'needle', 'needle', 'needle'].join('\n'), 'utf8')

    const result = await grepTool.execute(
      {
        absolute_path: sampleFilePath,
        max_results: 3,
        pattern: 'needle',
      },
      buildExecutionContext(workspacePath),
    )

    assert.equal(readNumberField(result, 'matchCount'), 3)
    assert.equal(readBooleanField(result, 'truncated'), true)
  })
})

test('grep tool rejects paths outside the locked root', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await withTemporaryDirectory(async (outsidePath) => {
      const outsideFilePath = path.join(outsidePath, 'outside.txt')
      await fs.writeFile(outsideFilePath, 'needle\n', 'utf8')

      await assert.rejects(
        grepTool.execute(
          {
            absolute_path: outsideFilePath,
            pattern: 'needle',
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
