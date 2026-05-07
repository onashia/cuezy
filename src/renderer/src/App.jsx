import { useEffect, useState } from 'react';

const emptySettings = {
  step: 60,
  segment: 18,
  start: 0,
};

function trackToRow(track, index) {
  return {
    id: `${track.position_sec ?? index}-${index}-${Date.now()}`,
    timestamp: track.timestamp || '',
    artist: track.artist || '',
    title: track.title || '',
    album: track.album || '',
    year: track.year ? String(track.year) : '',
  };
}

function fileName(filePath) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function UploadMark() {
  return (
    <svg className="upload-mark" viewBox="0 0 96 96" aria-hidden="true">
      <path d="M18 30.5C18 23.6 23.6 18 30.5 18h18.2c3.5 0 6.8 1.5 9.2 4.1l4.8 5.4h2.8C72.4 27.5 78 33.1 78 40v25.5C78 72.4 72.4 78 65.5 78h-35C23.6 78 18 72.4 18 65.5v-35Z" />
      <path d="M30 41h36M48 35v25M38 51l10-10 10 10" />
    </svg>
  );
}

export default function App() {
  const [appInfo, setAppInfo] = useState(null);
  const [filePath, setFilePath] = useState('');
  const [settings, setSettings] = useState(emptySettings);
  const [rows, setRows] = useState([]);
  const [notice, setNotice] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scanProgress, setScanProgress] = useState({ percent: 0, detail: '' });
  const [status, setStatus] = useState('Ready');

  useEffect(() => {
    window.cuezy.getAppInfo().then(setAppInfo).catch(error => {
      setNotice({ tone: 'warning', message: `App info unavailable: ${error.message}` });
    });

    const unsubs = [
      window.cuezy.onAnalysisProgress(({ progress }) => {
        if (progress.phase === 'scan' && !progress.segmentIndex && !progress.timestamp) {
          setScanProgress({
            percent: progress.percent ?? 0,
            detail: `${progress.step}s scan step, ${progress.segment}s samples`,
          });
          setStatus('Analyzing');
          return;
        }

        if (progress.phase === 'scan' && progress.timestamp) {
          setScanProgress({
            percent: progress.percent ?? 0,
            detail: `Scanning around ${progress.timestamp}`,
          });
        }
      }),
      window.cuezy.onSegmentResult(({ segment }) => {
        if (segment.status === 'matched' && segment.track) {
          setRows(current => [...current, trackToRow(segment.track, current.length)]);
        } else if (segment.status === 'skipped') {
          setNotice({ tone: 'warning', message: `Skipped the segment at ${segment.timestamp}.` });
        } else if (segment.status === 'error') {
          setNotice({ tone: 'warning', message: segment.error?.message || 'Segment error' });
        }
      }),
      window.cuezy.onAnalysisWarning(({ warning }) => {
        setNotice({ tone: 'warning', message: warning.message });
      }),
      window.cuezy.onAnalysisDone(({ result }) => {
        setIsRunning(false);
        setJobId(null);
        setScanProgress({ percent: 100, detail: `Scanned ${result.segmentsScanned} segment${result.segmentsScanned === 1 ? '' : 's'}` });
        setStatus(`Done: ${result.tracks.length} track${result.tracks.length === 1 ? '' : 's'}`);
        setNotice(current => {
          if (current?.tone === 'warning' || current?.tone === 'error') return current;
          return {
            tone: result.tracks.length > 0 ? 'success' : 'info',
            message: result.tracks.length > 0
              ? `Found ${result.tracks.length} track${result.tracks.length === 1 ? '' : 's'}.`
              : 'No tracks were found in this pass.',
          };
        });
      }),
      window.cuezy.onAnalysisError(({ error }) => {
        setIsRunning(false);
        setJobId(null);
        const cancelled = error.name === 'AbortError' || /cancel/i.test(error.message || '');
        setScanProgress(current => ({
          ...current,
          detail: cancelled ? 'Analysis cancelled' : error.message,
        }));
        setStatus(cancelled ? 'Cancelled' : 'Error');
        setNotice({
          tone: cancelled ? 'info' : 'error',
          message: cancelled ? 'Analysis cancelled.' : error.message,
        });
      }),
    ];

    return () => unsubs.forEach(unsub => unsub());
  }, []);

  function setNumericSetting(name, value) {
    setSettings(current => ({ ...current, [name]: value }));
  }

  async function pickFile() {
    const result = await window.cuezy.selectAudioFile();
    if (!result.canceled && result.filePath) {
      setFilePath(result.filePath);
      setRows([]);
      setNotice(null);
      setScanProgress({ percent: 0, detail: '' });
      setStatus('Ready');
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const droppedPath = window.cuezy.getDroppedFilePath(file);
    if (droppedPath) {
      setFilePath(droppedPath);
      setRows([]);
      setNotice(null);
      setScanProgress({ percent: 0, detail: '' });
      setStatus('Ready');
    } else {
      setNotice({ tone: 'warning', message: 'Could not read dropped file path. Use Choose File.' });
    }
  }

  async function startAnalysis() {
    setRows([]);
    setNotice(null);
    setScanProgress({ percent: 0, detail: 'Preparing analysis' });
    setStatus('Starting');
    setIsRunning(true);

    try {
      const result = await window.cuezy.startAnalysis({
        filePath,
        step: settings.step,
        segment: settings.segment,
        start: settings.start,
      });
      setJobId(result.jobId);
    } catch (error) {
      setIsRunning(false);
      setJobId(null);
      setScanProgress({ percent: 0, detail: error.message });
      setStatus('Error');
      setNotice({ tone: 'error', message: error.message });
    }
  }

  async function cancelAnalysis() {
    if (!jobId) return;
    await window.cuezy.cancelAnalysis(jobId);
    setStatus('Cancelling');
    setNotice({ tone: 'info', message: 'Cancellation requested. Current request may finish first.' });
  }

  function updateRow(id, field, value) {
    setRows(current => current.map(row => (
      row.id === id ? { ...row, [field]: value } : row
    )));
  }

  function deleteRow(id) {
    setRows(current => current.filter(row => row.id !== id));
  }

  async function copyMarkdown() {
    const result = await window.cuezy.copyMarkdownTracklist(rows);
    setStatus(result.copied ? 'Copied Markdown' : 'Copy failed');
    setNotice({
      tone: result.copied ? 'success' : 'error',
      message: result.copied ? 'Markdown copied to clipboard.' : 'Could not copy Markdown.',
    });
  }

  async function save(format) {
    const result = await window.cuezy.saveExport(format, rows);
    if (!result.canceled) {
      setStatus(`Saved ${format.toUpperCase()}`);
      setNotice({ tone: 'success', message: `Saved ${result.filePath}` });
    }
  }

  const canAnalyze = filePath && !isRunning;
  const ffmpegMissing = appInfo && !appInfo.ffmpegAvailable;
  const showSplash = !filePath && !isRunning;
  const showResults = rows.length > 0 || (!isRunning && status.startsWith('Done'));
  const showMeter = isRunning || rows.length > 0 || status !== 'Ready';
  const progressValue = !isRunning && (rows.length > 0 || status.startsWith('Done'))
    ? 100
    : Math.max(0, Math.min(100, Number(scanProgress.percent) || 0));
  const analysisTitle = isRunning
    ? `Analyzing ${fileName(filePath)}`
    : rows.length > 0
      ? `${rows.length} track${rows.length === 1 ? '' : 's'} found`
      : 'Ready to analyze';
  const analysisDetail = scanProgress.detail || (rows.length > 0
    ? 'Review and export your editable tracklist.'
    : 'Cuezy will use the default scan settings.');

  const dropHandlers = {
    onDragOver: event => {
      event.preventDefault();
      setDragActive(true);
    },
    onDragLeave: () => setDragActive(false),
    onDrop: handleDrop,
  };

  if (showSplash) {
    return (
      <main className={`splash-shell${dragActive ? ' is-dragging' : ''}`} {...dropHandlers}>
        <section className="splash-card">
          <div className="brand-lockup">
            <div className="brand-mark">C</div>
            <h1>Cuezy</h1>
          </div>

          <div className="splash-drop-zone">
            <UploadMark />
            <strong>Drop an audio or video file</strong>
            <span>or choose one from disk</span>
            <button type="button" className="primary choose-button" onClick={pickFile}>
              Choose File
            </button>
          </div>

          {ffmpegMissing ? (
            <p className="splash-warning">ffmpeg and ffprobe are required before analysis can run.</p>
          ) : notice ? (
            <p className={`splash-warning ${notice.tone}`}>{notice.message}</p>
          ) : (
            <p className="splash-note">Cuezy analyzes local files and sends short snippets to Shazam for recognition.</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Cuezy</h1>
          <p>Find timestamped songs in local audio and VOD files.</p>
        </div>
      </header>

      <section className="analysis-panel">
        <div className={`compact-drop-zone${dragActive ? ' is-active' : ''}`} {...dropHandlers}>
          <UploadMark />
          <div>
            <strong>{fileName(filePath)}</strong>
            <span>{filePath}</span>
          </div>
          <button type="button" onClick={pickFile} disabled={isRunning}>
            Change
          </button>
        </div>

        {ffmpegMissing && (
          <div className="warning">
            ffmpeg and ffprobe are required. Install ffmpeg before analyzing.
          </div>
        )}

        <div className="analysis-status">
          <div>
            <h2>{analysisTitle}</h2>
            <p>{analysisDetail}</p>
          </div>

          {showMeter && (
            <div className="analysis-meter" aria-label={`Analysis progress ${progressValue}%`}>
              <div style={{ width: `${progressValue}%` }} />
            </div>
          )}

          {notice && (
            <p className={`status-notice ${notice.tone}`} aria-live="polite">
              {notice.message}
            </p>
          )}
        </div>

        <div className="analysis-actions">
          {isRunning ? (
            <button type="button" className="cancel-button" onClick={cancelAnalysis} disabled={!jobId}>
              Cancel
            </button>
          ) : (
            <button type="button" className="primary" onClick={startAnalysis} disabled={!canAnalyze || ffmpegMissing}>
              {rows.length > 0 ? 'Analyze Again' : 'Analyze'}
            </button>
          )}
          <button
            type="button"
            className="secondary-toggle"
            onClick={() => setShowAdvanced(current => !current)}
            aria-expanded={showAdvanced}
            disabled={isRunning}
          >
            {showAdvanced ? 'Hide Advanced' : 'Advanced'}
          </button>
        </div>

        {showAdvanced && !isRunning && (
          <div className="settings-grid">
            <Field label="Scan step">
              <input
                type="number"
                min="1"
                value={settings.step}
                onChange={event => setNumericSetting('step', event.target.value)}
              />
            </Field>
            <Field label="Segment length">
              <input
                type="number"
                min="1"
                value={settings.segment}
                onChange={event => setNumericSetting('segment', event.target.value)}
              />
            </Field>
            <Field label="Start time">
              <input
                type="number"
                min="0"
                value={settings.start}
                onChange={event => setNumericSetting('start', event.target.value)}
              />
            </Field>
          </div>
        )}
      </section>

      {showResults && (
        <section className="workspace">
          <section className="results-panel">
            <div className="panel-header">
              <div>
                <h2>Tracklist</h2>
                <p>{rows.length} editable result{rows.length === 1 ? '' : 's'}</p>
              </div>
              {rows.length > 0 && (
                <div className="export-actions">
                  <button type="button" onClick={copyMarkdown}>
                    Copy Markdown
                  </button>
                  <button type="button" onClick={() => save('markdown')}>
                    Save Markdown
                  </button>
                  <button type="button" onClick={() => save('json')}>
                    JSON
                  </button>
                  <button type="button" onClick={() => save('txt')}>
                    TXT
                  </button>
                </div>
              )}
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Artist</th>
                    <th>Song</th>
                    <th>Album</th>
                    <th>Year</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="empty-cell">No tracks were found in this pass.</td>
                    </tr>
                  ) : rows.map(row => (
                    <tr key={row.id}>
                      <td>
                        <input value={row.timestamp} onChange={event => updateRow(row.id, 'timestamp', event.target.value)} />
                      </td>
                      <td>
                        <input value={row.artist} onChange={event => updateRow(row.id, 'artist', event.target.value)} />
                      </td>
                      <td>
                        <input value={row.title} onChange={event => updateRow(row.id, 'title', event.target.value)} />
                      </td>
                      <td>
                        <input value={row.album} onChange={event => updateRow(row.id, 'album', event.target.value)} />
                      </td>
                      <td>
                        <input value={row.year} onChange={event => updateRow(row.id, 'year', event.target.value)} />
                      </td>
                      <td>
                        <button type="button" className="link-button" onClick={() => deleteRow(row.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
