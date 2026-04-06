import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createGlobToolResult, createGrepToolResult, createListToolResult } from '../../electron/chat/shared/tools/workspaceTools'

async function createWorkspaceFixture() {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-workspace-tools-'))

  await fs.mkdir(path.join(workspaceRootPath, 'src'), { recursive: true })
  await fs.mkdir(path.join(workspaceRootPath, 'ignored'), { recursive: true })
  await fs.mkdir(path.join(workspaceRootPath, 'node_modules', 'pkg'), { recursive: true })
  await fs.writeFile(path.join(workspaceRootPath, '.gitignore'), 'ignored/\n*.secret\n.env\n', 'utf8')
  await fs.writeFile(
    path.join(workspaceRootPath, 'src', 'visible.ts'),
    'export const visible = "needle"\nconst clearMpinValue = clearMpin(\n',
    'utf8',
  )
  await fs.writeFile(path.join(workspaceRootPath, 'src', 'listable.ts'), 'export const listable = "list"\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'notes.md'), 'This note mentions list and needle.\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'ignored', 'hidden.ts'), 'export const hidden = "needle"\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'plain.secret'), 'needle\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, '.env'), 'SECRET=needle\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'node_modules', 'pkg', 'index.ts'), 'export const dependency = "needle"\n', 'utf8')

  return workspaceRootPath
}

test('createListToolResult lists only immediate visible directory entries at the requested path', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createListToolResult(workspaceRootPath, workspaceRootPath, '.')

    assert.equal(result.status, 'success')
    assert.match(result.body ?? '', /^src\/$/mu)
    assert.match(result.body ?? '', /\.env/u)
    assert.doesNotMatch(result.body ?? '', /ignored/u)
    assert.doesNotMatch(result.body ?? '', /plain\.secret/u)
    assert.doesNotMatch(result.body ?? '', /node_modules/u)
    assert.doesNotMatch(result.body ?? '', /visible\.ts/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGlobToolResult excludes matches from gitignored directories, even when searching inside an ignored subtree', async () => {
  const workspaceRootPath = await createWorkspaceFixture()
  const ignoredDirectoryPath = path.join(workspaceRootPath, 'ignored')

  try {
    const workspaceResult = await createGlobToolResult(workspaceRootPath, workspaceRootPath, '.', '**/*.ts')
    const ignoredResult = await createGlobToolResult(workspaceRootPath, ignoredDirectoryPath, 'ignored', '**/*.ts')

    assert.equal(workspaceResult.status, 'success')
    assert.match(workspaceResult.body ?? '', /visible\.ts/u)
    assert.doesNotMatch(workspaceResult.body ?? '', /hidden\.ts/u)
    assert.doesNotMatch(workspaceResult.body ?? '', /node_modules/u)

    assert.equal(ignoredResult.status, 'success')
    assert.equal(ignoredResult.body, 'No files found')
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGrepToolResult excludes matches from gitignored paths while preserving always-visible env files', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createGrepToolResult(workspaceRootPath, workspaceRootPath, '.', 'needle', '**/{*,.*}')

    assert.equal(result.status, 'success')
    assert.match(result.body ?? '', /visible\.ts/u)
    assert.match(result.body ?? '', /\.env/u)
    assert.doesNotMatch(result.body ?? '', /hidden\.ts/u)
    assert.doesNotMatch(result.body ?? '', /plain\.secret/u)
    assert.doesNotMatch(result.body ?? '', /node_modules/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGrepToolResult defaults to code-like files when no include glob is provided', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createGrepToolResult(workspaceRootPath, workspaceRootPath, '.', 'list', undefined)

    assert.equal(result.status, 'success')
    assert.match(result.body ?? '', /listable\.ts/u)
    assert.doesNotMatch(result.body ?? '', /notes\.md/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGrepToolResult supports regex searches when explicitly requested', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createGrepToolResult(workspaceRootPath, workspaceRootPath, '.', '\\blist\\b', undefined, true)

    assert.equal(result.status, 'success')
    assert.match(result.body ?? '', /listable\.ts/u)
    assert.doesNotMatch(result.body ?? '', /notes\.md/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGrepToolResult treats invalid regex input as a literal search', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createGrepToolResult(workspaceRootPath, workspaceRootPath, '.', 'clearMpin(', undefined)

    assert.equal(result.status, 'success')
    assert.match(result.body ?? '', /clearMpin\(/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})
