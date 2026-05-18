import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { cleanAnalysisOptions, cleanExportRequest, cleanRows } from './contracts.js';

function on(channel, callback) {
  if (typeof callback !== 'function') return () => {};
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  selectAudioFile: () => ipcRenderer.invoke('dialog:select-audio-file'),
  getDroppedFilePath: file => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  startAnalysis: options => ipcRenderer.invoke('analysis:start', cleanAnalysisOptions(options)),
  cancelAnalysis: jobId => ipcRenderer.invoke('analysis:cancel', String(jobId || '')),
  copyMarkdownTracklist: rows => ipcRenderer.invoke('export:copy-markdown', cleanRows(rows)),
  saveExport: (format, rows, meta) => ipcRenderer.invoke('export:save', cleanExportRequest(format, rows, meta)),
  onAnalysisProgress: callback => on('analysis:progress', callback),
  onSegmentResult: callback => on('analysis:segment-result', callback),
  onAnalysisWarning: callback => on('analysis:warning', callback),
  onAnalysisDone: callback => on('analysis:done', callback),
  onAnalysisError: callback => on('analysis:error', callback),
};

contextBridge.exposeInMainWorld('cuezy', Object.freeze(api));
