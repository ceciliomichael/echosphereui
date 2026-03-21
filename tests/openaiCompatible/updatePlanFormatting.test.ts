import assert from 'node:assert/strict'
import test from 'node:test'
import { formatSuccessResultBody } from '../../electron/chat/openaiCompatible/toolResultBodies'

test('formatSuccessResultBody renders todo_write as compact multiline lines without markdown bullets', () => {
  const body = formatSuccessResultBody('todo_write', {
    allStepsCompleted: false,
    planId: 'default',
    steps: [
      { id: '1', status: 'in_progress', title: 'Understand current file structure and content' },
      { id: '2', status: 'pending', title: 'Add 2 more sections to the document' },
      { id: '3', status: 'pending', title: 'Verify the changes and summarize outcome' },
    ],
  })

  assert.match(body, /^Todo list default$/mu)
  assert.match(body, /^1\. \[in_progress\] /mu)
  assert.match(body, /^2\. \[pending\] /mu)
  assert.match(body, /^3\. \[pending\] /mu)
  assert.equal(body.includes('\n- '), false)
})
