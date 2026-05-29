import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ffmpegManifest = JSON.parse(readFileSync(new URL('../resources/ffmpeg-manifest.json', import.meta.url), 'utf8'));

function findResourceMapping(resources, from, to) {
  return resources?.find(resource => resource.from === from && resource.to === to);
}

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

test('packaged builds do not grant extra file protocol privileges', () => {
  assert.equal(packageJson.build?.electronFuses?.grantFileProtocolExtraPrivileges, false);
});

test('mac packaged builds include bundled audio tools', () => {
  const resource = findResourceMapping(
    packageJson.build?.mac?.extraResources,
    'resources/bin/darwin-${arch}',
    'bin/darwin-${arch}',
  );

  assert.ok(resource);
  assert.deepEqual(resource.filter, ['**/*']);
});

test('windows packaged builds include bundled audio tools', () => {
  assert.match(packageJson.scripts?.['dist:win'], /--target win32-x64/);
  assert.match(packageJson.scripts?.['dist:win'], /electron-builder --win nsis zip --x64/);
  assert.match(packageJson.scripts?.['dist:win'], /-c\.win\.signAndEditExecutable=true/);
  assert.match(packageJson.scripts?.['dist:win:zip'], /electron-builder --win --x64/);
  assert.equal(packageJson.build?.win?.signAndEditExecutable, false);
  assert.deepEqual(packageJson.build?.win?.target, [
    { target: 'zip', arch: ['x64'] },
  ]);

  const resource = findResourceMapping(
    packageJson.build?.win?.extraResources,
    'resources/bin/win32-${arch}',
    'bin/win32-${arch}',
  );

  assert.ok(resource);
  assert.deepEqual(resource.filter, ['**/*']);
});

test('windows audio tool manifest pins executable artifacts', () => {
  const target = ffmpegManifest.targets?.['win32-x64'];

  assert.equal(target?.status, 'active');
  assert.match(target?.version, /^\d+\.\d+/);
  assert.equal(target?.license, 'GPL-3.0-or-later');
  assert.equal(target?.artifacts?.ffmpeg?.archiveType, 'zip');
  assert.equal(target?.artifacts?.ffprobe?.archiveType, 'zip');
  assert.match(target?.artifacts?.ffmpeg?.path, /ffmpeg\.exe$/);
  assert.match(target?.artifacts?.ffprobe?.path, /ffprobe\.exe$/);
  assert.match(target?.artifacts?.ffmpeg?.sha256, /^[a-f0-9]{64}$/);
  assert.match(target?.artifacts?.ffprobe?.sha256, /^[a-f0-9]{64}$/);
});
