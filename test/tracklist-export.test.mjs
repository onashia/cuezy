import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCueExport,
  buildExport,
  markdownTracklist,
  normalizeTrackRows,
  txtTracklist,
} from '../lib/export.mjs';

const rows = [
  { timestamp: '00:00', artist: 'Artist A', title: 'Song A', album: 'Album A', year: '2024' },
  { timestamp: '20:00', artist: 'Artist B', title: 'Song B', album: '', year: '' },
];

test('formats markdown tracklists for copy and save', () => {
  assert.equal(markdownTracklist(rows), '# Tracklist\n\n00:00 - Artist A - Song A\n20:00 - Artist B - Song B\n');
});

test('formats markdown tracklists without empty field separators', () => {
  assert.equal(
    markdownTracklist([
      { timestamp: '00:00', artist: '', title: 'Song A' },
      { timestamp: '', artist: 'Artist B', title: 'Song B' },
    ]),
    '# Tracklist\n\n00:00 - Song A\nArtist B - Song B\n'
  );
});

test('formats txt tracklists', () => {
  assert.equal(txtTracklist(rows), 'Artist A - Song A 00:00\nArtist B - Song B 20:00\n');
});

test('formats txt tracklists without empty field separators', () => {
  assert.equal(
    txtTracklist([
      { timestamp: '00:00', artist: '', title: 'Song A' },
      { timestamp: '', artist: 'Artist B', title: 'Song B' },
    ]),
    'Song A 00:00\nArtist B - Song B\n'
  );
});

test('builds json exports with normalized rows', () => {
  assert.deepEqual(JSON.parse(buildExport('json', rows)), { tracks: rows });
});

test('builds cue exports from shared rows', () => {
  assert.match(
    buildCueExport(rows, { audioFilename: 'saved mix.mp3', title: 'saved mix' }),
    /FILE "saved mix\.mp3" MP3\n  TRACK 01 AUDIO\n    TITLE "Song A"\n    PERFORMER "Artist A"\n    INDEX 01 00:00:00/
  );
});

test('passes cue metadata through generic export builder', () => {
  assert.match(
    buildExport('cue', rows, { audioFilename: 'source mix.mka', title: 'source mix' }),
    /TITLE "source mix"\nFILE "source mix\.mka" MP3/
  );
});

test('uses wave cue file type for wav sources', () => {
  assert.match(
    buildCueExport(rows, { audioFilename: 'source mix.wav' }),
    /FILE "source mix\.wav" WAVE/
  );
});

test('falls back to timestamp when cue position is empty', () => {
  assert.match(
    buildCueExport([
      { timestamp: '01:30', position_sec: '', artist: 'Artist', title: 'Song' },
    ]),
    /INDEX 01 01:30:00/
  );
});

test('accepts raw second timestamps for cue indexes', () => {
  assert.match(
    buildCueExport([
      { timestamp: '120', artist: 'Artist', title: 'Song' },
    ]),
    /INDEX 01 02:00:00/
  );
});

test('preserves numeric zero timestamps for cue indexes', () => {
  assert.match(
    buildCueExport([
      { timestamp: 0, artist: 'Artist', title: 'Intro' },
    ]),
    /TRACK 01 AUDIO\n    TITLE "Intro"\n    PERFORMER "Artist"\n    INDEX 01 00:00:00/
  );
});

test('skips cue tracks without valid timing information', () => {
  const cue = buildCueExport([
    { timestamp: '', artist: 'Artist A', title: 'Untimed' },
    { timestamp: '60', artist: 'Artist B', title: 'Timed' },
  ]);

  assert.doesNotMatch(cue, /Untimed/);
  assert.match(cue, /TRACK 01 AUDIO\n    TITLE "Timed"/);
  assert.match(cue, /INDEX 01 01:00:00/);
});

test('does not limit normalized rows unless requested', () => {
  const manyRows = Array.from({ length: 3 }, (_, index) => ({
    timestamp: `00:0${index}`,
    artist: `Artist ${index}`,
    title: `Song ${index}`,
  }));

  assert.equal(normalizeTrackRows(manyRows).length, 3);
  assert.equal(normalizeTrackRows(manyRows, { maxRows: 2 }).length, 2);
});

test('applies requested row limits to markdown exports', () => {
  const manyRows = Array.from({ length: 3 }, (_, index) => ({
    timestamp: `00:0${index}`,
    artist: `Artist ${index}`,
    title: `Song ${index}`,
  }));

  assert.equal(
    markdownTracklist(manyRows, { maxRows: 2 }),
    '# Tracklist\n\n00:00 - Artist 0 - Song 0\n00:01 - Artist 1 - Song 1\n'
  );
});

test('rejects unsupported export formats', () => {
  assert.throws(() => buildExport('html', rows), /Unsupported export format/);
});
