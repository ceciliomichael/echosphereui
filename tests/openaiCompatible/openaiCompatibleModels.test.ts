import assert from 'node:assert/strict'
import test from 'node:test'
const { createOpenAICompatibleClient, normalizeOpenAICompatibleBaseUrl } = await import(
  '../../electron/chat/openaiCompatible/client'
)

test('normalizeOpenAICompatibleBaseUrl appends v1 when needed', () => {
  assert.equal(normalizeOpenAICompatibleBaseUrl('http://localhost:11434'), 'http://localhost:11434/v1')
  assert.equal(
    normalizeOpenAICompatibleBaseUrl('https://example.com/openai'),
    'https://example.com/openai/v1',
  )
  assert.equal(
    normalizeOpenAICompatibleBaseUrl('https://example.com/custom/v1/'),
    'https://example.com/custom/v1',
  )
})

test('createOpenAICompatibleClient strips authorization when api key is blank', async () => {
  const originalFetch = globalThis.fetch
  const requests: Array<{ authorization: string | null; url: string }> = []

  globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    requests.push({
      authorization: request.headers.get('authorization'),
      url: request.url,
    })

    return new Response(
      JSON.stringify({
        data: [{ id: 'model-a' }, { id: 'model-b' }, { id: 'model-a' }],
        object: 'list',
      }),
      {
        headers: {
          'content-type': 'application/json',
        },
        status: 200,
      },
    )
  }

  try {
    const client = createOpenAICompatibleClient({
      apiKey: '',
      baseUrl: 'http://localhost:4010',
    })
    const models = await client.models.list()

    assert.deepEqual(models.data.map((model) => model.id), ['model-a', 'model-b', 'model-a'])
    assert.equal(requests.length, 1)
    assert.equal(requests[0]?.authorization, null)
    assert.equal(requests[0]?.url, 'http://localhost:4010/v1/models')
  } finally {
    globalThis.fetch = originalFetch
  }
})
