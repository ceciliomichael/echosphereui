import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { listWorkspaceDirectory } from '../../electron/workspace/explorer'

async function withTemporaryDirectory<T>(callback: (directoryPath: string) => Promise<T>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-workspace-explorer-test-'))

  try {
    return await callback(directoryPath)
  } finally {
    await fs.rm(directoryPath, { force: true, recursive: true })
  }
}

test('workspace explorer respects .gitignore while keeping allowlisted env files visible', async () => {
  await withTemporaryDirectory(async (workspacePath) => {
    await fs.writeFile(path.join(workspacePath, '.gitignore'), 'ignored.txt\nbuild/\n.env\n', 'utf8')
    await fs.mkdir(path.join(workspacePath, '.git'), { recursive: true })
    await fs.mkdir(path.join(workspacePath, 'node_modules'), { recursive: true })
    await fs.mkdir(path.join(workspacePath, '.next'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, '.DS_Store'), 'junk', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'Thumbs.db'), 'junk', 'utf8')
    await fs.writeFile(path.join(workspacePath, '.git', 'config'), 'ignored', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'node_modules', 'ignored.js'), 'ignored', 'utf8')
    await fs.writeFile(path.join(workspacePath, '.next', 'ignored.js'), 'ignored', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'ignored.txt'), 'ignored', 'utf8')
    await fs.writeFile(path.join(workspacePath, '.env'), 'SHOULD_SHOW=true', 'utf8')
    await fs.writeFile(path.join(workspacePath, '.env.local'), 'SHOULD_SHOW_TOO=true', 'utf8')
    await fs.writeFile(path.join(workspacePath, 'visible.txt'), 'visible', 'utf8')
    await fs.mkdir(path.join(workspacePath, 'build'), { recursive: true })
    await fs.writeFile(path.join(workspacePath, 'build', 'ignored.ts'), 'ignored', 'utf8')

    const entries = await listWorkspaceDirectory({
      relativePath: '.',
      workspaceRootPath: workspacePath,
    })

    const entryNames = entries.map((entry) => entry.name)

    assert.deepEqual(entryNames, ['.env', '.env.local', '.gitignore', 'visible.txt'])
    assert.equal(entryNames.includes('ignored.txt'), false)
    assert.equal(entryNames.includes('build'), false)
    assert.equal(entryNames.includes('.git'), false)
    assert.equal(entryNames.includes('node_modules'), false)
    assert.equal(entryNames.includes('.next'), false)
    assert.equal(entryNames.includes('.DS_Store'), false)
    assert.equal(entryNames.includes('Thumbs.db'), false)
  })
})
