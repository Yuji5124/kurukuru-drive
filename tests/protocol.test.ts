import test from 'node:test';
import assert from 'node:assert/strict';
import { isDriveInput } from '../src/network/protocol.ts';

test('accepts a well-formed controller input', () => {
  assert.equal(isDriveInput({ type: 'input', version: 1, steering: 0.35, brake: false, horn: true, seq: 101 }), true);
});

test('rejects out-of-range, malformed, and unordered field types', () => {
  assert.equal(isDriveInput({ type: 'input', version: 1, steering: 1.1, brake: false, horn: false, seq: 1 }), false);
  assert.equal(isDriveInput({ type: 'input', version: 1, steering: 0, brake: 0, horn: false, seq: 1 }), false);
});
