import test from 'node:test';
import assert from 'node:assert/strict';
import { formatHeaders, isTargetRequest } from '../src/headers.js';

const target = 'https://api-partner.spotify.com/pathfinder/v2/query';
const pair = (authorization = 'Bearer A', clientToken = 'B') => [
  { name: 'AuThOrIzAtIoN', value: authorization },
  { name: 'Client-Token', value: clientToken },
];

test('accepts the exact endpoint, with optional query string', () => {
  assert.equal(isTargetRequest(target), true);
  assert.equal(isTargetRequest(`${target}?operationName=foo`), true);
});

for (const url of [
  'not a URL', target.replace('https:', 'http:'), `${target}/extra`,
  `${target}/`, target.replace('spotify.com', 'spotify.com.evil.test'),
  'https://open.spotify.com/pathfinder/v2/query',
]) {
  test(`rejects unrelated URL: ${url}`, () => assert.equal(isTargetRequest(url), false));
}

test('copies only the two headers as server-compatible plain text', () => {
  assert.equal(formatHeaders([
    ...pair(), { name: 'cookie', value: 'secret' }, { name: 'x-extra', value: 'ignored' },
  ]), 'authorization: Bearer A\nclient-token: B');
});

for (const headers of [
  [], [pair()[0]], [pair()[1]], pair('', 'B'), pair('Bearer A', ''),
  pair('Bearer ', 'B'), pair('Basic A', 'B'), pair('bearer A', 'B'),
  pair('Bearer A\r\nx-injected: C', 'B'), pair('Bearer A', 'B\nC'),
  [{ name: 'authorization' }, pair()[1]],
]) {
  test(`rejects missing or invalid credentials: ${JSON.stringify(headers)}`, () => {
    assert.equal(formatHeaders(headers), null);
  });
}

test('never combines credentials from different calls', () => {
  assert.equal(formatHeaders([pair()[0]]), null);
  assert.equal(formatHeaders([pair()[1]]), null);
});
