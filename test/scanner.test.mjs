import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { scan } from '../lib/scanner.mjs';

test('reports progress relative to resumed start position', async () => {
  const progress = [];

  await scan('/tmp/fake mix.mp3', {
    duration: 110,
    start: 40,
    step: 20,
    segment: 10,
    quiet: true,
    rateLimitMs: 0,
    extractSegment: (_file, _start, _duration, outPath) => {
      writeFileSync(outPath, Buffer.alloc(8));
      return true;
    },
    recognize: async () => null,
    callbacks: {
      onProgress(update) {
        progress.push(update);
      },
    },
  });

  assert.deepEqual(
    progress.map(update => update.percent),
    [25, 50, 75, 100]
  );
  assert.deepEqual(
    progress.map(update => update.totalSegments),
    [4, 4, 4, 4]
  );
});

test('removes temporary scan directory after scanning', async () => {
  let scanDir;

  await scan('/tmp/fake mix.mp3', {
    duration: 20,
    step: 10,
    segment: 10,
    quiet: true,
    rateLimitMs: 0,
    extractSegment: (_file, _start, _duration, outPath) => {
      scanDir = dirname(outPath);
      writeFileSync(outPath, Buffer.alloc(8));
      return true;
    },
    recognize: async () => null,
  });

  assert.equal(existsSync(scanDir), false);
});
