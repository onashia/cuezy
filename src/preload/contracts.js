function cleanNumber(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function cleanAnalysisOptions(options = {}) {
  return {
    filePath: typeof options.filePath === 'string' ? options.filePath : '',
    step: cleanNumber(options.step, null),
    segment: cleanNumber(options.segment, 18),
    start: cleanNumber(options.start, 0),
  };
}

export function cleanRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(row => ({
    timestamp: String(row?.timestamp ?? ''),
    artist: String(row?.artist ?? ''),
    title: String(row?.title ?? ''),
    album: String(row?.album ?? ''),
    year: String(row?.year ?? ''),
  }));
}

export function cleanExportMeta(meta = {}) {
  return {
    audioFilename: typeof meta.audioFilename === 'string' ? meta.audioFilename : '',
    source: typeof meta.source === 'string' ? meta.source : '',
    title: typeof meta.title === 'string' ? meta.title : '',
  };
}

export function cleanExportRequest(format, rows, meta) {
  return {
    format: String(format || 'markdown'),
    rows: cleanRows(rows),
    ...cleanExportMeta(meta),
  };
}
