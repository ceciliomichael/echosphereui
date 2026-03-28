import assert from 'node:assert/strict'
import test from 'node:test'
import { buildChatMentionPathMap, collapseChatMentionMarkup } from '../../src/lib/chatMentions'

test('collapseChatMentionMarkup converts markdown mentions back to plain mention text', () => {
  assert.equal(collapseChatMentionMarkup('check @[AGENTS.md](AGENTS.md) please'), 'check @AGENTS.md please')
})

test('buildChatMentionPathMap preserves mention paths from persisted markdown mentions', () => {
  const mentionPathMap = buildChatMentionPathMap('check @[AGENTS.md](AGENTS.md) and @[docs/readme.md](docs/readme.md)')

  assert.deepEqual(Array.from(mentionPathMap.entries()), [
    ['AGENTS.md', 'AGENTS.md'],
    ['docs/readme.md', 'docs/readme.md'],
  ])
})
