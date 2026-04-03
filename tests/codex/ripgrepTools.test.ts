import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { __testOnly } from '../../electron/chat/shared/tools'

class FakeChildProcess extends EventEmitter {
  stderr = new PassThrough()
  stdout = new PassThrough()
}

test('normalizeRipgrepCandidatePath repairs missing node_modules separator before scoped packages', () => {
  const brokenPath = path.join('C:', 'repo', 'node_modules@vscode', 'ripgrep', 'bin', 'rg.exe')
  const repairedPath = path.join('C:', 'repo', 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg.exe')

  assert.equal(__testOnly.normalizeRipgrepCandidatePath(brokenPath), repairedPath)
})

test('buildRipgrepCommandCandidates keeps repaired module paths and PATH lookup fallback', async () => {
  const repairedPath = path.join('C:', 'repo', 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg.exe')
  const candidates = await __testOnly.buildRipgrepCommandCandidates({
    currentWorkingDirectory: path.join('C:', 'repo'),
    isPackagedApp: false,
    moduleCandidatePaths: [path.join('C:', 'repo', 'node_modules@vscode', 'ripgrep', 'bin', 'rg.exe')],
    pathExistsImpl: async (candidatePath) => candidatePath === repairedPath,
    resourcesPath: null,
  })

  assert.deepEqual(candidates, [repairedPath, process.platform === 'win32' ? 'rg.exe' : 'rg'])
})

test('runRipgrepWithCandidates retries another executable after ENOENT', async () => {
  const attemptedCommands: string[] = []
  const fakeSpawn = ((command: string) => {
    attemptedCommands.push(command)
    const child = new FakeChildProcess()

    queueMicrotask(() => {
      if (command === 'missing-rg.exe') {
        const error = new Error(`spawn ${command} ENOENT`) as NodeJS.ErrnoException
        error.code = 'ENOENT'
        child.emit('error', error)
        return
      }

      child.stdout.write('match\n')
      child.stdout.end()
      child.stderr.end()
      child.emit('close', 0)
    })

    return child as unknown as ReturnType<typeof spawn>
  }) as typeof spawn

  const result = await __testOnly.runRipgrepWithCandidates(
    ['--version'],
    path.join('C:', 'repo'),
    ['missing-rg.exe', 'working-rg.exe'],
    fakeSpawn,
  )

  assert.deepEqual(attemptedCommands, ['missing-rg.exe', 'working-rg.exe'])
  assert.equal(result.exitCode, 0)
  assert.equal(result.stdout, 'match\n')
  assert.equal(result.stderr, '')
})
