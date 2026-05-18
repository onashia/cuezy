import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanAnalysisOptions,
  cleanExportMeta,
  cleanExportRequest,
  cleanRows,
} from '../src/preload/contracts.js';

test('preload analysis options coerce numeric fields for IPC', () => {
  assert.deepEqual(cleanAnalysisOptions({
    filePath: '/tmp/local mix.mp3',
    step: '60',
    segment: '20',
    start: '5',
  }), {
    filePath: '/tmp/local mix.mp3',
    step: 60,
    segment: 20,
    start: 5,
  });
});

test('preload analysis options fall back on missing or invalid values', () => {
  assert.deepEqual(cleanAnalysisOptions({
    filePath: 42,
    step: '   ',
    segment: Number.NaN,
    start: 'nope',
  }), {
    filePath: '',
    step: null,
    segment: 18,
    start: 0,
  });
});

test('preload rows keep only exportable string fields', () => {
  assert.deepEqual(cleanRows([
    {
      timestamp: 0,
      artist: 'Artist',
      title: 'Title',
      album: null,
      year: 2026,
      ignored: 'value',
    },
    null,
  ]), [
    {
      timestamp: '0',
      artist: 'Artist',
      title: 'Title',
      album: '',
      year: '2026',
    },
    {
      timestamp: '',
      artist: '',
      title: '',
      album: '',
      year: '',
    },
  ]);
});

test('preload export metadata keeps only supported string fields', () => {
  assert.deepEqual(cleanExportMeta({
    audioFilename: 'mix.wav',
    source: '/tmp/mix.wav',
    title: 'Saved Mix',
    extra: 'ignored',
  }), {
    audioFilename: 'mix.wav',
    source: '/tmp/mix.wav',
    title: 'Saved Mix',
  });

  assert.deepEqual(cleanExportMeta({
    audioFilename: 1,
    source: null,
    title: false,
  }), {
    audioFilename: '',
    source: '',
    title: '',
  });
});

test('preload export request matches save IPC payload shape', () => {
  assert.deepEqual(cleanExportRequest('', [
    { timestamp: '00:01', artist: 'Artist', title: 'Song' },
  ], {
    audioFilename: 'mix.mp3',
    source: '/tmp/mix.mp3',
    title: 'Mix',
  }), {
    format: 'markdown',
    rows: [
      {
        timestamp: '00:01',
        artist: 'Artist',
        title: 'Song',
        album: '',
        year: '',
      },
    ],
    audioFilename: 'mix.mp3',
    source: '/tmp/mix.mp3',
    title: 'Mix',
  });
});
