import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  defaultExportName,
  exportMeta,
  fileFilters,
  MAX_EXPORT_ROWS,
  resolveAudioTools,
  validateAnalysisInput,
} from '../src/main/contracts.js';
import {
  RENDERER_ENTRY_URL,
  resolveRendererProtocolPath,
} from '../src/main/renderer-protocol.js';

test('desktop analysis validation accepts local files and normalized options', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuezy-main-contracts-'));

  try {
    const file = join(dir, 'local mix.mp3');
    writeFileSync(file, 'audio');

    assert.deepEqual(await validateAnalysisInput({
      filePath: file,
      step: '60',
      segment: '20',
      start: '5',
    }), {
      filePath: file,
      options: {
        step: 60,
        segment: 20,
        start: 5,
        outputDir: process.cwd(),
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('desktop analysis validation falls back for blank numeric inputs', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuezy-main-contracts-'));

  try {
    const file = join(dir, 'local mix.mp3');
    writeFileSync(file, 'audio');

    assert.deepEqual(await validateAnalysisInput({
      filePath: file,
      step: '   ',
      segment: null,
      start: '',
    }), {
      filePath: file,
      options: {
        step: null,
        segment: 18,
        start: 0,
        outputDir: process.cwd(),
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('desktop analysis validation rejects non-string numeric coercions', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cuezy-main-contracts-'));

  try {
    const file = join(dir, 'local mix.mp3');
    writeFileSync(file, 'audio');

    assert.deepEqual(await validateAnalysisInput({
      filePath: file,
      step: false,
      segment: ['20'],
      start: [],
    }), {
      filePath: file,
      options: {
        step: null,
        segment: 18,
        start: 0,
        outputDir: process.cwd(),
      },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('desktop analysis validation rejects URLs before Electron starts work', async () => {
  await assert.rejects(
    validateAnalysisInput({ filePath: 'https://example.com/mix', step: null }),
    /The desktop MVP supports local files only/
  );
});

test('desktop analysis validation rejects missing file selection', async () => {
  await assert.rejects(validateAnalysisInput(null), /Analysis options are required/);
  await assert.rejects(validateAnalysisInput({ filePath: '   ' }), /Select an audio file first/);
});

test('desktop export helpers keep renderer save contracts stable', () => {
  assert.equal(MAX_EXPORT_ROWS, 2000);
  assert.equal(defaultExportName('json'), 'cuezy-tracklist.json');
  assert.equal(defaultExportName('txt'), 'cuezy-tracklist.txt');
  assert.equal(defaultExportName('cue'), 'cuezy-tracklist.cue');
  assert.equal(defaultExportName('markdown'), 'cuezy-tracklist.md');
  assert.deepEqual(fileFilters('cue'), [{ name: 'CUE', extensions: ['cue'] }]);
  assert.deepEqual(fileFilters('markdown'), [{ name: 'Markdown', extensions: ['md', 'markdown'] }]);
  assert.deepEqual(exportMeta({
    audioFilename: 'mix.wav',
    source: 'source path',
    title: 'Saved Mix',
    extra: 'ignored',
  }), {
    audioFilename: 'mix.wav',
    source: 'source path',
    title: 'Saved Mix',
    maxRows: 2000,
  });
});

test('renderer protocol resolves only app-local files', () => {
  const rendererRoot = join('/app', 'out', 'renderer');

  assert.equal(RENDERER_ENTRY_URL, 'cuezy://app/index.html');
  assert.equal(
    resolveRendererProtocolPath(rendererRoot, 'cuezy://app/index.html'),
    join(rendererRoot, 'index.html')
  );
  assert.equal(
    resolveRendererProtocolPath(rendererRoot, 'cuezy://app/assets/index.js'),
    join(rendererRoot, 'assets', 'index.js')
  );
  assert.equal(
    resolveRendererProtocolPath(rendererRoot, 'cuezy://app/'),
    join(rendererRoot, 'index.html')
  );
});

test('renderer protocol rejects unexpected origins and traversal', () => {
  const rendererRoot = join('/app', 'out', 'renderer');

  assert.equal(resolveRendererProtocolPath(rendererRoot, 'file:///app/out/renderer/index.html'), null);
  assert.equal(resolveRendererProtocolPath(rendererRoot, 'cuezy://other/index.html'), null);
  assert.equal(resolveRendererProtocolPath(rendererRoot, 'cuezy://app/%2e%2e/main/index.js'), null);
  assert.equal(resolveRendererProtocolPath(rendererRoot, 'cuezy://app/%E0%A4%A'), null);
});

test('audio tool resolution prefers bundled tools', () => {
  const bundled = {
    available: true,
    ffmpegCommand: '/app/bin/ffmpeg',
    ffprobeCommand: '/app/bin/ffprobe',
    source: 'bundled',
    binDir: '/app/bin',
  };

  assert.equal(resolveAudioTools({
    bundled,
    isPackaged: true,
    hasSystemCommand() {
      throw new Error('system lookup should not run');
    },
  }), bundled);
});

test('audio tool resolution requires bundled tools in packaged builds', () => {
  assert.deepEqual(resolveAudioTools({
    bundled: {
      available: false,
      ffmpegCommand: null,
      ffprobeCommand: null,
      source: 'system',
      binDir: '/app/bin',
    },
    isPackaged: true,
    hasSystemCommand() {
      return true;
    },
  }), {
    available: false,
    ffmpegCommand: null,
    ffprobeCommand: null,
    source: 'missing',
    binDir: '/app/bin',
  });
});

test('audio tool resolution can use system tools in dev builds', () => {
  assert.deepEqual(resolveAudioTools({
    bundled: {
      available: false,
      ffmpegCommand: null,
      ffprobeCommand: null,
      source: 'system',
      binDir: '/repo/resources/bin',
    },
    isPackaged: false,
    hasSystemCommand(command) {
      return command === 'ffmpeg' || command === 'ffprobe';
    },
  }), {
    available: true,
    ffmpegCommand: 'ffmpeg',
    ffprobeCommand: 'ffprobe',
    source: 'system',
    binDir: '/repo/resources/bin',
  });
});
