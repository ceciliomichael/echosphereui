import assert from 'node:assert/strict'
import test from 'node:test'
import {
  hasMeaningfulAssistantContent,
  normalizeAssistantMessageContent,
  stripInternalToolCallLeakage,
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

test('normalizeAssistantMessageContent preserves natural content text without scaffold stripping', () => {
  const parsed = normalizeAssistantMessageContent({
    content: [
      'I will inspect the workspace.',
      'Assistant to=run_terminal.run_terminal json {"cmd":"npm run lint","login":true}',
      'Then I will report back.',
    ].join('\n'),
    reasoningContent: '',
  })

  assert.equal(
    parsed.content,
    'I will inspect the workspace.\nAssistant to=run_terminal.run_terminal json {"cmd":"npm run lint","login":true}\nThen I will report back.',
  )
  assert.equal(parsed.reasoningContent, '')
})

test('stripInternalToolCallLeakage removes leaked internal tool routing lines', () => {
  const sanitized = stripInternalToolCallLeakage([
    'I am checking the shared scaffold.',
    '{"absolute_path":"C:\\\\repo\\\\file.dart","max_lines":260,"start_line":1} to=functions.read code',
    '彩冲争勇直了下载assistant to=functions.read in commentary {"absolute_path":"C:\\\\repo\\\\file.dart"}',
    'Then I will patch the right boundary.',
  ].join('\n'))

  assert.equal(
    sanitized,
    [
      'I am checking the shared scaffold.',
      'Then I will patch the right boundary.',
    ].join('\n'),
  )
})

test('stripInternalToolCallLeakage removes raw argument fragments adjacent to leaked tool routing lines', () => {
  const sanitized = stripInternalToolCallLeakage([
    'I am checking the shared scaffold.',
    '{"absolute_path":"C:\\\\repo\\\\file.dart","max_lines":260,"start_line":1}',
    'assistant to=functions.read in commentary',
    'Then I will patch the right boundary.',
  ].join('\n'))

  assert.equal(
    sanitized,
    [
      'I am checking the shared scaffold.',
      'Then I will patch the right boundary.',
    ].join('\n'),
  )
})

test('normalizeAssistantMessageContent strips leaked internal tool routing lines from visible content', () => {
  const parsed = normalizeAssistantMessageContent({
    content: [
      'I am checking the shared scaffold.',
      '{"absolute_path":"C:\\\\repo\\\\file.dart","max_lines":260,"start_line":1} to=functions.read code',
      'Then I will patch the right boundary.',
    ].join('\n'),
    reasoningContent: '',
  })

  assert.equal(
    parsed.content,
    [
      'I am checking the shared scaffold.',
      'Then I will patch the right boundary.',
    ].join('\n'),
  )
  assert.equal(parsed.reasoningContent, '')
})
