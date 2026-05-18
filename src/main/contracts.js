import { normalizeAnalysisRequest } from '../../lib/analyze-audio.mjs';

export const AUDIO_EXTENSIONS = [
  'mp3',
  'wav',
  'flac',
  'm4a',
  'aac',
  'ogg',
  'opus',
  'webm',
  'mka',
  'mp4',
  'mov',
  'mkv',
];

export const MAX_EXPORT_ROWS = 2000;

function cleanNumber(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export async function validateAnalysisInput(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('Analysis options are required.');
  }

  if (typeof input.filePath !== 'string' || input.filePath.trim() === '') {
    throw new TypeError('Select an audio file first.');
  }

  const request = await normalizeAnalysisRequest(input.filePath, {
    step: cleanNumber(input.step, null),
    segment: cleanNumber(input.segment, null),
    start: cleanNumber(input.start, null),
  }, {
    allowUrls: false,
    requireLocalFile: true,
    localOnlyMessage: 'The desktop MVP supports local files only.',
  });

  return { filePath: request.input, options: request.options };
}

export function defaultExportName(format) {
  if (format === 'json') return 'cuezy-tracklist.json';
  if (format === 'txt') return 'cuezy-tracklist.txt';
  if (format === 'cue') return 'cuezy-tracklist.cue';
  return 'cuezy-tracklist.md';
}

export function fileFilters(format) {
  if (format === 'json') return [{ name: 'JSON', extensions: ['json'] }];
  if (format === 'txt') return [{ name: 'Text', extensions: ['txt'] }];
  if (format === 'cue') return [{ name: 'CUE', extensions: ['cue'] }];
  return [{ name: 'Markdown', extensions: ['md', 'markdown'] }];
}

export function exportMeta(input) {
  return {
    audioFilename: typeof input.audioFilename === 'string' ? input.audioFilename : '',
    source: typeof input.source === 'string' ? input.source : '',
    title: typeof input.title === 'string' ? input.title : '',
    maxRows: MAX_EXPORT_ROWS,
  };
}

export function resolveAudioTools({ bundled, isPackaged, hasSystemCommand }) {
  if (bundled.available) return bundled;

  if (isPackaged) {
    return {
      available: false,
      ffmpegCommand: null,
      ffprobeCommand: null,
      source: 'missing',
      binDir: bundled.binDir,
    };
  }

  const ffmpegAvailable = hasSystemCommand('ffmpeg');
  const ffprobeAvailable = hasSystemCommand('ffprobe');
  return {
    available: ffmpegAvailable && ffprobeAvailable,
    ffmpegCommand: 'ffmpeg',
    ffprobeCommand: 'ffprobe',
    source: 'system',
    binDir: bundled.binDir,
  };
}
