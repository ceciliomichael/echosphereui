import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasMeaningfulAssistantContent,
  normalizeAssistantMessageContent,
  splitThinkingContent,
} from '../../src/lib/chatMessageContent'

test('splitThinkingContent separates think blocks from normal assistant content', () => {
  const parsed = splitThinkingContent('Before <think>hidden</think> after <think>more</think> text')

  assert.equal(parsed.content, 'Before  after  text')
  assert.equal(parsed.reasoningContent, 'hiddenmore')
})

test('normalizeAssistantMessageContent ignores empty think wrappers', () => {
  const parsed = normalizeAssistantMessageContent({
    content: '<think></think>',
    reasoningContent: '',
  })

  assert.equal(parsed.content, '')
  assert.equal(parsed.reasoningContent, '')
  assert.equal(
    hasMeaningfulAssistantContent({
      content: '<think></think>',
      reasoningContent: '',
      toolInvocations: [],
    }),
    false,
  )
})

test('normalizeAssistantMessageContent strips assistant tool-call scaffolding from visible content', () => {
  const parsed = normalizeAssistantMessageContent({
    content: [
      'I will inspect the workspace.',
      'Assistant to=run_terminal.run_terminal json {"cmd":"npm run lint","login":true}',
      'Then I will report back.',
    ].join('\n'),
    reasoningContent: '',
  })

  assert.equal(parsed.content, 'I will inspect the workspace.\nThen I will report back.')
  assert.equal(parsed.reasoningContent, '')
})
