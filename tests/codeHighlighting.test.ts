import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveHighlightLanguage } from '../src/lib/codeHighlighting'

test('resolveHighlightLanguage maps common file extensions to shiki language ids', () => {
  assert.equal(resolveHighlightLanguage({ fileName: 'src/App.tsx' }), 'tsx')
  assert.equal(resolveHighlightLanguage({ fileName: 'script.py' }), 'python')
  assert.equal(resolveHighlightLanguage({ fileName: 'README.md' }), 'markdown')
  assert.equal(resolveHighlightLanguage({ fileName: 'Dockerfile' }), 'docker')
  assert.equal(resolveHighlightLanguage({ fileName: 'Makefile' }), 'make')
})

test('resolveHighlightLanguage preserves explicit fenced language labels when possible', () => {
  assert.equal(resolveHighlightLanguage({ language: 'tsx' }), 'tsx')
  assert.equal(resolveHighlightLanguage({ language: 'py' }), 'python')
  assert.equal(resolveHighlightLanguage({ language: 'jsonc' }), 'jsonc')
})
