import { app, BrowserWindow, clipboard, dialog, ipcMain, net, protocol, session } from 'electron';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { analyzeAudio } from '../../lib/analyze-audio.mjs';
import { hasCommand } from '../../lib/audio.mjs';
import { buildExport, markdownTracklist } from '../../lib/export.mjs';
import {
  RENDERER_ENTRY_URL,
  RENDERER_PROTOCOL,
  resolveRendererProtocolPath,
} from './renderer-protocol.js';
import { bundledAudioTools } from './tool-paths.js';
import {
  AUDIO_EXTENSIONS,
  MAX_EXPORT_ROWS,
  defaultExportName,
  exportMeta,
  fileFilters,
  resolveAudioTools,
  validateAnalysisInput,
} from './contracts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
let mainWindow;
let activeJob = null;
const hardenedContents = new WeakSet();

app.setName('Cuezy');
protocol.registerSchemesAsPrivileged([{
  scheme: RENDERER_PROTOCOL,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
  },
}]);

function isTrustedNavigation(currentUrl, nextUrl) {
  if (!currentUrl || !nextUrl) return false;

  try {
    const current = new URL(currentUrl);
    const next = new URL(nextUrl);

    if (current.protocol === `${RENDERER_PROTOCOL}:`) {
      return next.href === current.href;
    }

    if (isDev && current.origin === next.origin) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}

function registerRendererProtocol() {
  protocol.handle(RENDERER_PROTOCOL, request => {
    const filePath = resolveRendererProtocolPath(join(__dirname, '../renderer'), request.url);
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function hardenSession() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  session.defaultSession.setDevicePermissionHandler?.(() => false);
}

function hardenWebContents(contents) {
  if (hardenedContents.has(contents)) return;
  hardenedContents.add(contents);

  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  contents.on('will-attach-webview', event => {
    event.preventDefault();
  });

  contents.on('will-navigate', (event, url) => {
    if (!isTrustedNavigation(contents.getURL(), url)) {
      event.preventDefault();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 660,
    title: 'Cuezy',
    titleBarStyle: 'hiddenInset',
    show: false,
    backgroundColor: '#f7f3eb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      devTools: isDev,
      navigateOnDragDrop: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  hardenWebContents(mainWindow.webContents);

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadURL(RENDERER_ENTRY_URL);
  }
}

function ensureTrustedSender(event) {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('Untrusted IPC sender');
  }
}

function serializeError(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || 'Unknown error',
  };
}

function serializeSegment(segment) {
  if (!segment || typeof segment !== 'object') return segment;
  return {
    ...segment,
    error: segment.error ? serializeError(segment.error) : undefined,
  };
}

function send(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function audioTools() {
  return resolveAudioTools({
    bundled: bundledAudioTools(),
    isPackaged: app.isPackaged,
    hasSystemCommand: hasCommand,
  });
}

ipcMain.handle('app:get-info', event => {
  ensureTrustedSender(event);
  const tools = audioTools();
  return {
    name: app.getName(),
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    ffmpegAvailable: tools.available,
    audioToolsSource: tools.available ? tools.source : 'missing',
  };
});

ipcMain.handle('dialog:select-audio-file', async event => {
  ensureTrustedSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select audio or video file',
    properties: ['openFile'],
    filters: [
      { name: 'Audio and video', extensions: AUDIO_EXTENSIONS },
      { name: 'All files', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, filePath: null };
  }

  return { canceled: false, filePath: result.filePaths[0] };
});

ipcMain.handle('analysis:start', async (event, input) => {
  ensureTrustedSender(event);
  if (activeJob) {
    throw new Error('An analysis job is already running.');
  }

  const tools = audioTools();
  if (!tools.available) {
    throw new Error(app.isPackaged
      ? 'Cuezy could not find its bundled audio tools. Reinstall Cuezy and try again.'
      : 'ffmpeg and ffprobe are required. Install ffmpeg or add bundled tools under resources/bin and try again.');
  }

  const { filePath, options } = await validateAnalysisInput(input);
  const jobId = `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const controller = new AbortController();
  activeJob = { id: jobId, controller };

  queueMicrotask(async () => {
    try {
      const result = await analyzeAudio(filePath, {
        ...options,
        signal: controller.signal,
        ffmpegCommand: tools.ffmpegCommand,
        ffprobeCommand: tools.ffprobeCommand,
      }, {
        onProgress(progress) {
          send('analysis:progress', { jobId, progress });
        },
        onSegmentResult(segment) {
          send('analysis:segment-result', { jobId, segment: serializeSegment(segment) });
        },
        onWarning(warning) {
          send('analysis:warning', {
            jobId,
            warning: {
              message: warning.message,
              retryAfterMs: warning.retryAfterMs,
              attempt: warning.attempt,
            },
          });
        },
      });

      send('analysis:done', { jobId, result });
    } catch (error) {
      send('analysis:error', { jobId, error: serializeError(error) });
    } finally {
      if (activeJob?.id === jobId) activeJob = null;
    }
  });

  return { jobId };
});

ipcMain.handle('analysis:cancel', (event, jobId) => {
  ensureTrustedSender(event);
  if (!activeJob || activeJob.id !== jobId) {
    return { canceled: false };
  }

  activeJob.controller.abort('Analysis cancelled');
  return { canceled: true };
});

ipcMain.handle('export:copy-markdown', (event, rows) => {
  ensureTrustedSender(event);
  const text = markdownTracklist(rows, { maxRows: MAX_EXPORT_ROWS });
  clipboard.writeText(text);
  return { copied: true, text };
});

ipcMain.handle('export:save', async (event, input) => {
  ensureTrustedSender(event);
  if (!input || typeof input !== 'object') {
    throw new TypeError('Export request is required.');
  }

  const format = String(input.format || 'markdown');
  const text = buildExport(format, input.rows, exportMeta(input));
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save tracklist',
    defaultPath: defaultExportName(format),
    filters: fileFilters(format),
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null };
  }

  const { writeFile } = await import('fs/promises');
  await writeFile(result.filePath, text, 'utf8');
  return { canceled: false, filePath: result.filePath };
});

app.whenReady().then(() => {
  hardenSession();
  registerRendererProtocol();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  activeJob?.controller.abort('Application is quitting');
  activeJob = null;
});

app.on('web-contents-created', (_event, contents) => {
  hardenWebContents(contents);
});

// TODO: Add installer metadata once signing and notarization settings are ready.
