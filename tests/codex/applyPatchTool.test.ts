import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { applyPatchInWorkspace, parseApplyPatch } from '../../electron/chat/shared/applyPatch'
import { createAgentTools } from '../../electron/chat/shared/tools'

test('parseApplyPatch reads add and update hunks', () => {
  const parsed = parseApplyPatch(`*** Begin Patch
*** Add File: src/new.ts
+export const value = 1
*** Update File: src/existing.ts
@@
-old
+new
*** End Patch`)

  assert.equal(parsed.hunks.length, 2)
  assert.equal(parsed.hunks[0]?.type, 'add')
  assert.equal(parsed.hunks[1]?.type, 'update')
})

test('parseApplyPatch accepts heredoc-wrapped patch text', () => {
  const wrappedWithCat = parseApplyPatch(`cat <<'EOF'
*** Begin Patch
*** Add File: src/cat.txt
+cat
*** End Patch
EOF`)
  assert.equal(wrappedWithCat.hunks.length, 1)
  assert.equal(wrappedWithCat.hunks[0]?.type, 'add')

  const wrappedRaw = parseApplyPatch(`<<PATCH
*** Begin Patch
*** Add File: src/raw.txt
+raw
*** End Patch
PATCH`)
  assert.equal(wrappedRaw.hunks.length, 1)
  assert.equal(wrappedRaw.hunks[0]?.type, 'add')
})

test('applyPatchInWorkspace applies add, update, move, and delete operations', async () => {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-patch-'))
  await fs.mkdir(path.join(workspaceRootPath, 'src'), { recursive: true })
  await fs.writeFile(path.join(workspaceRootPath, 'src', 'existing.ts'), 'alpha\nbeta\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'src', 'remove.ts'), 'remove me\n', 'utf8')

  try {
    const result = await applyPatchInWorkspace(
      workspaceRootPath,
      `*** Begin Patch
*** Add File: src/new.ts
+export const created = true;
*** Update File: src/existing.ts
*** Move to: src/renamed.ts
@@
 alpha
-beta
+gamma
*** Delete File: src/remove.ts
*** End Patch`,
    )

    assert.equal(result.changes.length, 3)
    assert.equal(await fs.readFile(path.join(workspaceRootPath, 'src', 'new.ts'), 'utf8'), 'export const created = true;\n')
    assert.equal(await fs.readFile(path.join(workspaceRootPath, 'src', 'renamed.ts'), 'utf8'), 'alpha\ngamma\n')
    await assert.rejects(fs.readFile(path.join(workspaceRootPath, 'src', 'existing.ts'), 'utf8'))
    await assert.rejects(fs.readFile(path.join(workspaceRootPath, 'src', 'remove.ts'), 'utf8'))
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('applyPatchInWorkspace reports each path before mutation for checkpoint capture', async () => {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-patch-capture-'))
  await fs.mkdir(path.join(workspaceRootPath, 'src'), { recursive: true })
  await fs.writeFile(path.join(workspaceRootPath, 'src', 'existing.ts'), 'alpha\nbeta\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'src', 'target.ts'), 'old target\n', 'utf8')
  await fs.writeFile(path.join(workspaceRootPath, 'src', 'remove.ts'), 'remove me\n', 'utf8')

  try {
    const beforeChanges: Array<{ absolutePath: string; nextAbsolutePath?: string }> = []

    await applyPatchInWorkspace(
      workspaceRootPath,
      `*** Begin Patch
*** Add File: src/new.ts
+export const created = true;
*** Update File: src/existing.ts
*** Move to: src/target.ts
@@
 alpha
-beta
+gamma
*** Delete File: src/remove.ts
*** End Patch`,
      {
        onBeforeChange: (input) => {
          beforeChanges.push(input)
        },
      },
    )

    assert.deepEqual(beforeChanges, [
      {
        absolutePath: path.join(workspaceRootPath, 'src', 'new.ts'),
      },
      {
        absolutePath: path.join(workspaceRootPath, 'src', 'existing.ts'),
        nextAbsolutePath: path.join(workspaceRootPath, 'src', 'target.ts'),
      },
      {
        absolutePath: path.join(workspaceRootPath, 'src', 'remove.ts'),
      },
    ])
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createAgentTools omits write tools in plan mode', async () => {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-tools-'))

  try {
    const tools = await createAgentTools(
      {
        workspaceRootPath,
      },
      {
        chatMode: 'plan',
      },
    )

    assert.ok('list' in tools)
    assert.ok('read' in tools)
    assert.ok(!('apply' in tools))
    assert.ok(!('apply_patch' in tools))
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createAgentTools exposes write tools in agent mode', async () => {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-tools-'))

  try {
    const tools = await createAgentTools({
      workspaceRootPath,
    }, {
      chatMode: 'agent',
    })

    assert.ok('apply' in tools)
    assert.ok('apply_patch' in tools)
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})

test('createAgentTools describes grep as a file-or-directory scoped workspace search', async () => {
  const workspaceRootPath = await fs.mkdtemp(path.join(tmpdir(), 'echosphere-tools-'))

  try {
    const tools = await createAgentTools({
      workspaceRootPath,
    }, {
      chatMode: 'agent',
    })

    assert.ok('grep' in tools)
    const grepTool = tools.grep as { description?: string }

    assert.match(
      grepTool.description ?? '',
      /file or directory path in absolute_path, or omit it to search from the workspace root/u,
    )
  } finally {
    await fs.rm(workspaceRootPath, { force: true, recursive: true })
  }
})
