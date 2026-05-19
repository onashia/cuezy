import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('built preload remains sandbox-compatible', () => {
  const preloadPath = new URL('../out/preload/index.js', import.meta.url);
  assert.equal(existsSync(preloadPath), true, 'Run npm run build before checking the preload artifact.');

  const source = readFileSync(preloadPath, 'utf8');
  const requireCalls = [...source.matchAll(/\brequire\((['"`])([^'"`]+)\1\)/g)].map(match => match[2]);

  assert.deepEqual([...new Set(requireCalls)].sort(), ['electron']);
  assert.doesNotMatch(source, /\brequire\((['"`])\.{1,2}\//);
  assert.doesNotMatch(source, /\bimport\s*\(/);
  assert.match(source, /contextBridge\.exposeInMainWorld\("cuezy"/);
});

test('externalized shazam dependency is included for packaged runtime', () => {
  const electronViteConfig = readFileSync(new URL('../electron.vite.config.js', import.meta.url), 'utf8');

  assert.match(electronViteConfig, /external:\s*\[\s*['"]shazam-api['"]\s*\]/);
  assert.ok(packageJson.dependencies?.['shazam-api']);
  assert.ok(packageJson.build?.files?.includes('node_modules/**'));
  assert.ok(packageJson.build?.asarUnpack?.includes('**/node_modules/shazam-api/**'));
});
