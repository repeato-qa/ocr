import assert from 'node:assert/strict'
import { test } from 'node:test'

test('electron export exposes create via named and default exports', async () => {
  const electronModule = await import('@repeato/ocr/electron')

  assert.equal(typeof electronModule.create, 'function')
  assert.equal(typeof electronModule.default, 'function')
  assert.equal(typeof electronModule.default.create, 'function')
})