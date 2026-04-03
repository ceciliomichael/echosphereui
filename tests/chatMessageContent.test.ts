import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeMarkdownText } from '../src/lib/chatMessageContent'

test('normalizeMarkdownText repairs dangling double-backtick code fence endings', () => {
  const input = '```ts\nconst value = 1\n``'
  assert.equal(normalizeMarkdownText(input), '```ts\nconst value = 1\n```')
})

test('normalizeMarkdownText appends a closing code fence for unmatched blocks', () => {
  const input = '```html\n<section>hero</section>'
  assert.equal(normalizeMarkdownText(input), '```html\n<section>hero</section>\n```')
})

test('normalizeMarkdownText inserts paragraph spacing between glued reasoning sections', () => {
  const input = "Let's make it functional and easy to paste!Designing the hero section\nNext line"
  assert.equal(
    normalizeMarkdownText(input),
    "Let's make it functional and easy to paste!\n\nDesigning the hero section\nNext line",
  )
})
