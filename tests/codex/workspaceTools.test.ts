import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createGlobToolResult, createGrepToolResult, createListToolResult } from '../../electron/chat/shared/tools/workspaceTools'

async function createWorkspaceFixture() {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-workspace-tools-'))

  await fs.mkdir(path.join(workspaceRootPath, 'src'), { recursive: true })
  await fs.mkdir(path.join(workspaceRootPath, 'nested', 'package-a', 'src'), { recursive: true })
  await fs.mkdir(path.join(workspaceRootPath, 'ignored'), { recursive: true })
  await fs.mkdir(path.join(workspaceRootPath, '.git', 'objects'), { recursive: true })
  await fs.mkdir(path.join(workspaceRootPath, 'node_modules', 'pkg'), { recursive: true })
  await fs.writeFile(path.join(workspaceRootPath, '.gitignore'), 'ignored/\n*.secret\n.env\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'nested', 'package-a', '.gitignore'), 'src/generated.ts\n', 'utf8')
  await fs.writeFile(
    path.join(workspaceRootPath, 'src', 'visible.ts'),
    'export const visible = "needle"\nconst clearMpinValue = clearMpin(\n',
    'utf8',
  )
  await fs.writeFile(
    path.join(workspaceRootPath, 'nested', 'package-a', 'src', 'generated.ts'),
    'export const generated = "needle"\n',
    'utf8',
  )
  await fs.writeFile(
    path.join(workspaceRootPath, 'nested', 'package-a', 'src', 'kept.ts'),
    'export const kept = "needle"\n',
    'utf8',
  )
  await fs.writeFile(path.join(workspaceRootPath, 'src', 'listable.ts'), 'export const listable = "list"\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'notes.md'), 'This note mentions list and needle.\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'ignored', 'hidden.ts'), 'export const hidden = "needle"\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, '.git', 'config'), 'needle\n', 'utf8')
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

test('createGlobToolResult respects nested .gitignore files anywhere in the workspace tree', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createGlobToolResult(workspaceRootPath, workspaceRootPath, '.', '**/*.ts')

    assert.equal(result.status, 'success')
    assert.match(result.body ?? '', /nested[\\/]package-a[\\/]src[\\/]kept\.ts/u)
    assert.doesNotMatch(result.body ?? '', /nested[\\/]package-a[\\/]src[\\/]generated\.ts/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGlobToolResult excludes .git metadata even for broad git-like filename patterns', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createGlobToolResult(workspaceRootPath, workspaceRootPath, '.', '**/*git*')

    assert.equal(result.status, 'success')
    assert.match(result.body ?? '', /\.gitignore/u)
    assert.doesNotMatch(result.body ?? '', /[\\/]?\.git[\\/]+config/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGrepToolResult returns the ripgrep-style workspace match set', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createGrepToolResult(workspaceRootPath, workspaceRootPath, '.', 'needle', '**/{*,.*}')

    assert.equal(result.status, 'success')
    assert.equal(result.semantics?.matches, 3)
    assert.match(result.body ?? '', /visible\.ts/u)
    assert.match(result.body ?? '', /notes\.md/u)
    assert.match(result.body ?? '', /nested[\\/]package-a[\\/]src[\\/]kept\.ts/u)
    assert.doesNotMatch(result.body ?? '', /node_modules[\\/]+pkg[\\/]+index\.ts/u)
    assert.doesNotMatch(result.body ?? '', /ignored[\\/]+hidden\.ts/u)
    assert.doesNotMatch(result.body ?? '', /plain\.secret/u)
    assert.doesNotMatch(result.body ?? '', /\.env/u)
    assert.doesNotMatch(result.body ?? '', /[\\/]?\.git[\\/]+config/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGrepToolResult supports searching a specific file path', async () => {
  const workspaceRootPath = await createWorkspaceFixture()
  const filePath = path.join(workspaceRootPath, 'src', 'visible.ts')

  try {
    const result = await createGrepToolResult(workspaceRootPath, filePath, path.join('src', 'visible.ts'), 'needle', '**/*.ts')

    assert.equal(result.status, 'success')
    assert.equal(result.subject?.kind, 'file')
    assert.equal(result.semantics?.matches, 1)
    assert.match(result.body ?? '', /src[\\/]+visible\.ts/u)
    assert.doesNotMatch(result.body ?? '', /notes\.md/u)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGrepToolResult sorts matches by file path and line number', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const alphaFilePath = path.join(workspaceRootPath, 'src', 'alpha.ts')
    const betaFilePath = path.join(workspaceRootPath, 'src', 'beta.ts')
    await fs.writeFile(alphaFilePath, 'export const alpha = "needle"\n', 'utf8')
    await fs.writeFile(betaFilePath, 'export const beta = "needle"\n', 'utf8')

    const result = await createGrepToolResult(workspaceRootPath, workspaceRootPath, '.', 'needle', '**/*.ts')

    assert.equal(result.status, 'success')
    const body = result.body ?? ''
    assert.ok(body.indexOf(alphaFilePath) !== -1)
    assert.ok(body.indexOf(betaFilePath) !== -1)
    assert.ok(body.indexOf(alphaFilePath) < body.indexOf(betaFilePath))
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGrepToolResult returns no files for a missing pattern', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createGrepToolResult(workspaceRootPath, workspaceRootPath, '.', 'does-not-exist', undefined)

    assert.equal(result.status, 'success')
    assert.equal(result.body, 'No files found')
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createGrepToolResult returns no files for invalid regex patterns', async () => {
  const workspaceRootPath = await createWorkspaceFixture()

  try {
    const result = await createGrepToolResult(workspaceRootPath, workspaceRootPath, '.', 'clearMpin(', undefined)

    assert.equal(result.status, 'success')
    assert.equal(result.body, 'No files found')
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})
