import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

test('Firefox manifest exposes only the permissions needed for capture and clipboard', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 2);
  assert.deepEqual(manifest.background, { page: 'background.html', persistent: true });
  assert.equal(manifest.browser_action.default_popup, undefined);
  assert.deepEqual(manifest.permissions.toSorted(), [
    'clipboardWrite', 'webRequest',
    'https://open.spotify.com/*', 'https://api-partner.spotify.com/*',
  ].toSorted());
  assert.equal(manifest.content_scripts, undefined);
  for (const path of [manifest.background.page, ...Object.values(manifest.icons), 'result.html']) {
    await access(new URL(path, root));
  }
});

test('extension HTML loads packaged scripts only, without inline scripts', async () => {
  for (const page of ['background.html', 'result.html']) {
    const html = await readFile(new URL(page, root), 'utf8');
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    assert.ok(scripts.length > 0);
    for (const [, attributes, body] of scripts) {
      assert.equal(body.trim(), '');
      const path = attributes.match(/src="([^"]+)"/)?.[1];
      assert.ok(path && !path.includes(':') && !path.startsWith('//'));
      await access(new URL(path, root));
    }
  }
});
