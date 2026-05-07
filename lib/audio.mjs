/**
 * Audio utilities — download, probe, and extract segments.
 */

import { execFileSync, spawnSync } from 'child_process';
import { accessSync, constants, existsSync, statSync } from 'fs';
import { delimiter, isAbsolute, join } from 'path';

const WINDOWS_EXTENSIONS = ['.EXE', '.CMD', '.BAT', '.COM'];
const MACOS_COMMAND_DIRS = ['/opt/homebrew/bin', '/usr/local/bin', '/opt/local/bin'];

function executableCandidates(cmd) {
  if (process.platform !== 'win32' || /\.[^\\/]+$/.test(cmd)) return [cmd];
  const pathext = process.env.PATHEXT
    ? process.env.PATHEXT.split(';').filter(Boolean)
    : WINDOWS_EXTENSIONS;
  return [cmd, ...pathext.map(ext => cmd + ext)];
}

function canExecute(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function commandSearchDirs() {
  const dirs = (process.env.PATH || '').split(delimiter).filter(Boolean);
  if (process.platform === 'darwin') {
    for (const dir of MACOS_COMMAND_DIRS) {
      if (!dirs.includes(dir)) dirs.push(dir);
    }
  }

  return dirs;
}

function resolveCommand(cmd) {
  if (!cmd || /[\\/]/.test(cmd)) {
    const match = isAbsolute(cmd) && executableCandidates(cmd).find(canExecute);
    return match || cmd;
  }

  for (const dir of commandSearchDirs()) {
    const match = executableCandidates(join(dir, cmd)).find(canExecute);
    if (match) return match;
  }

  return cmd;
}

/** Check if a command exists on PATH. */
export function hasCommand(cmd) {
  return resolveCommand(cmd) !== cmd || (isAbsolute(cmd) && canExecute(cmd));
}

/** Get audio duration in seconds via ffprobe. */
export function getDuration(file) {
  const out = execFileSync(resolveCommand('ffprobe'), [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    file,
  ], { encoding: 'utf8' });
  return parseFloat(JSON.parse(out).format.duration);
}

/** Extract a segment as raw s16le mono 16kHz PCM for Shazam. */
export function extractSegment(file, startSec, durationSec, outPath, opts = {}) {
  const result = spawnSync(resolveCommand('ffmpeg'), [
    '-y',
    '-ss', String(startSec),
    '-t', String(durationSec),
    '-i', file,
    '-ac', '1',
    '-ar', '16000',
    '-f', 's16le',
    '-acodec', 'pcm_s16le',
    outPath,
  ], {
    stdio: ['ignore', 'ignore', 'ignore'],
    signal: opts.signal,
  });

  return result.status === 0;
}

/** Download audio from a URL using yt-dlp. Returns path to downloaded file. */
export function downloadURL(url, outputDir, opts = {}) {
  if (!hasCommand('yt-dlp')) {
    throw new Error('yt-dlp is required for URL downloads. Install: brew install yt-dlp');
  }

  const ytDlp = resolveCommand('yt-dlp');

  // Get title for filename
  const info = spawnSync(ytDlp, ['--print', 'title', '--no-download', url], {
    encoding: 'utf8',
    timeout: 30_000,
    signal: opts.signal,
  });

  const title = (info.status === 0 && info.stdout.trim())
    ? info.stdout.trim().replace(/[^a-zA-Z0-9\s\-_]/g, '').replace(/\s+/g, '-').toLowerCase().slice(0, 80)
    : 'downloaded-mix';

  const outTemplate = join(outputDir, `${title}.%(ext)s`);

  const dl = spawnSync(ytDlp, [
    '-x', '--audio-format', 'mp3', '--audio-quality', '0',
    '-o', outTemplate, '--no-playlist', '--progress', '--newline', url,
  ], {
    encoding: 'utf8',
    timeout: 600_000,
    signal: opts.signal,
    stdio: opts.stdio ?? ['ignore', 'inherit', 'inherit'],
  });

  if (dl.error) throw dl.error;
  if (dl.status !== 0) throw new Error('Download failed. Check the URL and try again.');

  // Find the output file
  const mp3Path = join(outputDir, `${title}.mp3`);
  if (existsSync(mp3Path)) return mp3Path;

  for (const ext of ['webm', 'opus', 'm4a', 'ogg', 'wav']) {
    const alt = join(outputDir, `${title}.${ext}`);
    if (existsSync(alt)) return alt;
  }

  throw new Error('Download failed. Check the URL and try again.');
}

/** Format file size for display. */
export function fileSize(path) {
  return (statSync(path).size / 1024 / 1024).toFixed(1) + ' MB';
}
