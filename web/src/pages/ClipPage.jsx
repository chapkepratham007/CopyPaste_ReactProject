import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchMeta, fileDownloadUrl, readClip, saveClip, uploadFiles } from "../api.js";

const EXPIRY_OPTIONS = [
  { label: "1 min", seconds: 1 * 60 },
  { label: "5 min", seconds: 5 * 60 },
  { label: "1 hour", seconds: 60 * 60 },
  { label: "2 hours", seconds: 2 * 60 * 60 },
  { label: "6 hours", seconds: 6 * 60 * 60 },
  { label: "1 day", seconds: 24 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { label: "330 days", seconds: 330 * 24 * 60 * 60 },
  { label: "Forever", seconds: null },
];

const MAX_TEXT_LENGTH = 2_000_000;
const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10 GB
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 256;

function formatTime(ms) {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ms);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function validateClipId(id) {
  if (!id || id.length === 0) return "Clip ID is required";
  if (id.length > 64) return "Clip ID must be 64 characters or less";
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return "Clip ID can only contain letters, numbers, hyphens, and underscores";
  return null;
}

function validatePassword(password) {
  if (!password || password.length === 0) return "Password is required";
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Password must be ${MAX_PASSWORD_LENGTH} characters or less`;
  return null;
}

function validateText(text) {
  if (text && text.length > MAX_TEXT_LENGTH) return `Text exceeds maximum length of ${formatBytes(MAX_TEXT_LENGTH)}`;
  return null;
}

function validateFiles(files) {
  if (!files || files.length === 0) return null;
  if (files.length > MAX_FILES) return `Maximum ${MAX_FILES} files allowed`;
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return `File "${file.name}" exceeds maximum size of ${formatBytes(MAX_FILE_SIZE)}`;
    }
  }
  return null;
}

export default function ClipPage() {
  const { clipId } = useParams();
  const safeClipId = useMemo(() => (clipId || "").trim(), [clipId]);

  const [mode, setMode] = useState("read");
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [destroyOnRead, setDestroyOnRead] = useState(true);
  const [expirySeconds, setExpirySeconds] = useState(EXPIRY_OPTIONS[0].seconds);

  const [meta, setMeta] = useState(null);
  const [readResult, setReadResult] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  // Validation states
  const [touched, setTouched] = useState({
    password: false,
    text: false,
    files: false,
  });

  const clipIdError = validateClipId(safeClipId);
  const passwordError = validatePassword(password);
  const textError = validateText(text);
  const filesError = validateFiles(selectedFiles);

  const isValid = !clipIdError && !passwordError && !textError && !filesError;

  const showPasswordError = touched.password && passwordError;
  const showTextError = touched.text && textError;
  const showFilesError = touched.files && filesError;

  useEffect(() => {
    let cancelled = false;
    setMeta(null);
    setReadResult(null);
    setError(null);
    setMessage(null);
    setTouched({ password: false, text: false, files: false });

    async function run() {
      try {
        const m = await fetchMeta(safeClipId);
        if (!cancelled) setMeta(m);
      } catch (e) {
        if (!cancelled) setMeta(null);
      }
    }

    if (safeClipId && !clipIdError) run();

    return () => {
      cancelled = true;
    };
  }, [safeClipId, clipIdError]);

  function handleModeChange(newMode) {
    setMode(newMode);
    setError(null);
    setMessage(null);
    setTouched({ password: false, text: false, files: false });
  }

  function handlePasswordChange(value) {
    setPassword(value);
    setTouched((t) => ({ ...t, password: true }));
  }

  function handleTextChange(value) {
    setText(value);
    setTouched((t) => ({ ...t, text: true }));
  }

  function handleFilesChange(files) {
    setSelectedFiles(files);
    setTouched((t) => ({ ...t, files: true }));
  }

  const [uploadProgress, setUploadProgress] = useState(0);

  async function onSave() {
    // Mark all as touched to show validation errors
    setTouched({ password: true, text: true, files: true });

    if (!isValid) {
      setError("Please fix validation errors");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    setUploadProgress(0);
    try {
      await saveClip({
        clipId: safeClipId,
        password,
        text,
        expiresInSeconds: expirySeconds,
        destroyOnRead,
      });

      if (selectedFiles.length > 0) {
        const hasLargeFiles = selectedFiles.some(f => f.size > 10 * 1024 * 1024);
        await uploadFiles({ 
          clipId: safeClipId, 
          password, 
          files: selectedFiles,
          onProgress: hasLargeFiles ? setUploadProgress : undefined
        });
        setSelectedFiles([]);
        setTouched({ password: true, text: false, files: false });
      }

      const m = await fetchMeta(safeClipId);
      setMeta(m);
      setMessage("Saved successfully!");
    } catch (e) {
      setError(e.message || "Save failed");
    } finally {
      setBusy(false);
      setUploadProgress(0);
    }
  }

  async function onRead() {
    setTouched((t) => ({ ...t, password: true }));

    if (passwordError) {
      setError("Please enter a valid password");
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await readClip({ clipId: safeClipId, password });
      setReadResult(result);
      setMessage(result?.destroyOnRead ? "Read (destroy-on-read may delete it now)." : "Read successfully!");

      try {
        const m = await fetchMeta(safeClipId);
        setMeta(m);
      } catch {
        setMeta(null);
      }
    } catch (e) {
      setError(e.message || "Read failed");
    } finally {
      setBusy(false);
    }
  }

  function copyTextToClipboard() {
    if (!readResult?.text) return;
    navigator.clipboard?.writeText(readResult.text).then(
      () => setMessage("Copied to clipboard!"),
      () => setError("Could not copy to clipboard")
    );
  }

  const canSubmit = isValid && !busy;
  const hasTextContent = text.length > 0;
  const hasReadText = readResult?.text && readResult.text.length > 0;

  return (
    <div className="container">
      <div className="hstack wrap" style={{ marginBottom: 12, flexShrink: 0 }}>
        <div>
          <div className="title">CopyPaste App</div>
          <div className="subtle small">Share text and files between devices</div>
        </div>
        <div className="spacer" />
        <span className={`badge ${clipIdError ? "error" : ""}`}>
          Clip: {safeClipId || "—"}
        </span>
      </div>

      {clipIdError && (
        <div className="toast error" style={{ marginBottom: 12, flexShrink: 0 }}>
          {clipIdError}
        </div>
      )}

      <div className="card">
        <div className="hstack wrap" style={{ marginBottom: 12, flexShrink: 0 }}>
          <button
            className={`button ${mode === "read" ? "" : "secondary"}`}
            onClick={() => handleModeChange("read")}
            type="button"
            disabled={busy}
          >
            Read
          </button>
          <button
            className={`button ${mode === "write" ? "" : "secondary"}`}
            onClick={() => handleModeChange("write")}
            type="button"
            disabled={busy}
          >
            Write
          </button>
          <div className="spacer" />
          <span className="badge">Expires: {meta?.expiresAt ? formatTime(meta.expiresAt) : "—"}</span>
          <span className="badge">Updated: {meta?.updatedAt ? formatTime(meta.updatedAt) : "—"}</span>
        </div>

        <div className="row" style={{ marginBottom: 12, flexShrink: 0 }}>
          <div>
            <div className={`label ${showPasswordError ? "error" : ""}`}>
              Password {passwordError && `(${passwordError})`}
            </div>
            <input
              className={`input ${showPasswordError ? "error" : ""}`}
              type="password"
              value={password}
              onChange={(e) => handlePasswordChange(e.target.value)}
              placeholder="Required to read/write"
              disabled={busy}
            />
          </div>

          {mode === "write" ? (
            <div>
              <div className="label">Expiry</div>
              <select
                className="select"
                value={expirySeconds === null ? "null" : String(expirySeconds)}
                onChange={(e) => {
                  const v = e.target.value;
                  setExpirySeconds(v === "null" ? null : Number(v));
                }}
                disabled={busy}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={String(o.seconds)} value={o.seconds === null ? "null" : String(o.seconds)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <div className="label">Info</div>
              <div className="info-grid">
                <span className="badge">Files: {meta?.files?.length ?? 0}</span>
                <span className="badge">Text: {meta?.hasText ? "yes" : "no"}</span>
              </div>
            </div>
          )}
        </div>

        <hr style={{ margin: "8px 0" }} />

        <div className="card-content">
          {mode === "write" ? (
            <WriteMode
              text={text}
              onTextChange={handleTextChange}
              textError={showTextError ? textError : null}
              selectedFiles={selectedFiles}
              onFilesChange={handleFilesChange}
              filesError={showFilesError ? filesError : null}
              destroyOnRead={destroyOnRead}
              onDestroyOnReadChange={setDestroyOnRead}
              onSave={onSave}
              canSubmit={canSubmit}
              busy={busy}
              uploadProgress={uploadProgress}
            />
          ) : (
            <ReadMode
              readResult={readResult}
              meta={meta}
              onRead={onRead}
              onCopy={copyTextToClipboard}
              canSubmit={canSubmit}
              busy={busy}
              hasReadText={hasReadText}
              clipId={safeClipId}
              password={password}
            />
          )}
        </div>

        {error && <div className="toast error">{error}</div>}
        {message && <div className="toast success">{message}</div>}
      </div>
    </div>
  );
}

function WriteMode({
  text,
  onTextChange,
  textError,
  selectedFiles,
  onFilesChange,
  filesError,
  destroyOnRead,
  onDestroyOnReadChange,
  onSave,
  canSubmit,
  busy,
  uploadProgress,
}) {
  const totalSize = selectedFiles.reduce((sum, f) => sum + f.size, 0);
  const hasLargeFiles = selectedFiles.some(f => f.size > 100 * 1024 * 1024); // > 100MB

  return (
    <>
      <div className="section">
        <div className="section-header">
          <div className={`label ${textError ? "error" : ""}`}>
            Text {text.length > 0 && `(${formatBytes(text.length)} / ${formatBytes(MAX_TEXT_LENGTH)})`}
            {textError && `- ${textError}`}
          </div>
        </div>
        <textarea
          className={`textarea ${textError ? "error" : ""}`}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder="Paste text here..."
          disabled={busy}
        />
      </div>

      <div style={{ height: 12, flexShrink: 0 }} />

      <div className="row" style={{ flexShrink: 0 }}>
        <div>
          <div className={`label ${filesError ? "error" : ""}`}>
            Files (optional) {filesError && `- ${filesError}`}
          </div>
          <input
            className={`input ${filesError ? "error" : ""}`}
            type="file"
            multiple
            onChange={(e) => onFilesChange(Array.from(e.target.files || []))}
            disabled={busy}
          />
          <div className={`file-stats ${filesError ? "error" : ""}`} style={{ marginTop: 6 }}>
            <span>{selectedFiles.length} / {MAX_FILES} files</span>
            <span>{formatBytes(totalSize)} total</span>
            <span>Max {formatBytes(MAX_FILE_SIZE)} per file</span>
          </div>
          {hasLargeFiles && (
            <div className="subtle small" style={{ marginTop: 4, color: "#f59e0b" }}>
              Large files detected - upload may take time
            </div>
          )}
        </div>

        <div>
          <div className="label">Destroy on read</div>
          <label className="checkbox-label" style={{ marginTop: 6 }}>
            <input
              type="checkbox"
              checked={destroyOnRead}
              onChange={(e) => onDestroyOnReadChange(e.target.checked)}
              disabled={busy}
            />
            <span className="subtle">Delete automatically after someone reads</span>
          </label>
        </div>
      </div>

      <div className="toolbar" style={{ flexShrink: 0 }}>
        <button className="button" disabled={!canSubmit} onClick={onSave} type="button">
          {busy && uploadProgress > 0 
            ? `Uploading ${uploadProgress}%...` 
            : busy 
              ? "Saving..." 
              : "Save"
          }
        </button>
        <div className="spacer" />
        <span className="subtle small">Share: {window.location.href}</span>
      </div>
      
      {busy && uploadProgress > 0 && (
        <div className="progress-bar" style={{ marginTop: 8 }}>
          <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
          <span className="small">{uploadProgress}%</span>
        </div>
      )}
    </>
  );
}

function ReadMode({ readResult, meta, onRead, onCopy, canSubmit, busy, hasReadText, clipId, password }) {
  const hasSuccessfullyRead = !!readResult;
  const fileCount = meta?.files?.length ?? 0;
  const displayFiles = readResult?.files || [];

  return (
    <>
      <div className="toolbar" style={{ flexShrink: 0 }}>
        <button className="button" disabled={!canSubmit} onClick={onRead} type="button">
          {busy ? "Reading..." : "Unlock & Read"}
        </button>
        <button
          className="button secondary"
          disabled={!hasReadText || busy}
          onClick={onCopy}
          type="button"
        >
          Copy text
        </button>
        <div className="spacer" />
        <span className="badge">Last read: {meta?.lastReadAt ? formatTime(meta.lastReadAt) : "—"}</span>
      </div>

      <div className="section">
        <div className="section-header">
          <div className="label">Text</div>
        </div>
        <textarea
          className="textarea"
          value={readResult?.text || ""}
          readOnly
          placeholder={hasSuccessfullyRead ? "No text content" : "Click 'Unlock & Read' to view content"}
        />
      </div>

      <div style={{ height: 12, flexShrink: 0 }} />

      <div style={{ flexShrink: 0 }}>
        {!hasSuccessfullyRead ? (
          <div className="fileItem subtle" style={{ justifyContent: "center" }}>
            <span>
              {fileCount > 0 
                ? `${fileCount} file${fileCount > 1 ? 's' : ''} hidden - enter password to view`
                : "No files"
              }
            </span>
          </div>
        ) : (
          <>
            <div className="label">Files ({displayFiles.length})</div>
            <div className="list" style={{ marginTop: 8 }}>
              {displayFiles.length === 0 ? (
                <div className="fileItem subtle">No files</div>
              ) : (
                displayFiles.map((f) => (
                  <FileItem key={f.id} file={f} clipId={clipId} password={password} />
                ))
              )}
            </div>
            <DownloadHelper clipId={clipId} password={password} files={displayFiles} />
          </>
        )}
      </div>
    </>
  );
}

function FileItem({ file, clipId, password }) {
  const [err, setErr] = useState(null);
  const [progress, setProgress] = useState(0);
  const [downloading, setDownloading] = useState(false);

  async function download() {
    if (!password) {
      setErr("Enter password first");
      return;
    }
    setErr(null);
    setDownloading(true);
    setProgress(0);
    try {
      const url = fileDownloadUrl({ clipId, fileId: file.id });
      
      // For large files, use XMLHttpRequest for progress tracking
      if (file.size > 5 * 1024 * 1024) {
        await downloadWithProgress(url, password, file.original_name, setProgress);
      } else {
        // Small files - use fetch
        const res = await fetch(url, {
          headers: { "x-clip-password": password },
        });
        if (!res.ok) {
          let data;
          try {
            data = await res.json();
          } catch {
            data = null;
          }
          throw new Error(data?.error || `Download failed (${res.status})`);
        }
        const blob = await res.blob();
        triggerDownload(blob, file.original_name);
      }
    } catch (e) {
      setErr(e.message || "Download failed");
    } finally {
      setDownloading(false);
      setProgress(0);
    }
  }

  function downloadWithProgress(url, password, fileName, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.setRequestHeader("x-clip-password", password);
      xhr.responseType = "blob";
      
      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          triggerDownload(xhr.response, fileName);
          resolve();
        } else {
          reject(new Error(`Download failed (${xhr.status})`));
        }
      };
      
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send();
    });
  }

  function triggerDownload(blob, fileName) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className={`fileItem ${err ? "error" : ""} ${downloading ? "downloading" : ""}`}>
      <div style={{ overflow: "hidden", flex: 1 }}>
        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {file.original_name}
        </div>
        <div className="subtle small">
          {file.mime_type} · {formatBytes(file.size)}
        </div>
        {err && <div className="validation-error">{err}</div>}
        {downloading && progress > 0 && (
          <div className="progress-bar" style={{ marginTop: 6 }}>
            <div 
              className="progress-fill" 
              style={{ width: `${progress}%` }}
            />
            <span className="small">{progress}%</span>
          </div>
        )}
      </div>
      <button 
        className="button secondary" 
        onClick={download} 
        type="button" 
        style={{ flexShrink: 0 }}
        disabled={downloading}
      >
        {downloading ? "..." : "Download"}
      </button>
    </div>
  );
}

function DownloadHelper({ clipId, password, files }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  async function downloadAll() {
    if (!password) {
      setErr("Enter password first");
      return;
    }
    if (files.length === 0) {
      setErr("No files to download");
      return;
    }
    setBusy(true);
    setErr(null);
    setProgress({ current: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const url = fileDownloadUrl({ clipId, fileId: f.id });
        
        // For large files, download with progress
        if (f.size > 5 * 1024 * 1024) {
          await downloadLargeFile(url, password, f.original_name, f.size);
        } else {
          const res = await fetch(url, {
            headers: { "x-clip-password": password },
          });
          if (!res.ok) {
            let data;
            try {
              data = await res.json();
            } catch {
              data = null;
            }
            throw new Error(`${f.original_name}: ${data?.error || `Failed (${res.status})`}`);
          }
          const blob = await res.blob();
          triggerDownload(blob, f.original_name);
        }
        setProgress({ current: i + 1, total: files.length });
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (e) {
      setErr(e.message || "Download failed");
    } finally {
      setBusy(false);
      setProgress({ current: 0, total: 0 });
    }
  }

  function downloadLargeFile(url, password, fileName, fileSize) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.setRequestHeader("x-clip-password", password);
      xhr.responseType = "blob";
      
      xhr.onload = () => {
        if (xhr.status === 200) {
          triggerDownload(xhr.response, fileName);
          resolve();
        } else {
          reject(new Error(`Download failed (${xhr.status})`));
        }
      };
      
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send();
    });
  }

  function triggerDownload(blob, fileName) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName || "download";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  if (files.length === 0) return null;

  const hasLargeFiles = files.some(f => f.size > 5 * 1024 * 1024);

  return (
    <div style={{ marginTop: 12, flexShrink: 0 }}>
      <div className="hstack">
        <button className="button secondary" onClick={downloadAll} disabled={busy} type="button">
          {busy 
            ? `Downloading ${progress.current}/${progress.total}...` 
            : hasLargeFiles 
              ? "Download All (large files)" 
              : "Download All Files"
          }
        </button>
        <span className="subtle small">
          {files.length} file{files.length > 1 ? 's' : ''} · {formatBytes(files.reduce((s, f) => s + f.size, 0))} total
        </span>
      </div>
      {err && <div className="validation-error" style={{ marginTop: 6 }}>{err}</div>}
    </div>
  );
}
