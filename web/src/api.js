// Use relative URL in production, absolute in development
const isDev = import.meta.env.DEV;
const rawApiBase = import.meta.env.VITE_API_BASE || (isDev ? "http://localhost:8787" : "");

// Construct full URL - if it's just a hostname (no protocol), prepend https://
const API_BASE = rawApiBase && !rawApiBase.startsWith("http://") && !rawApiBase.startsWith("https://")
  ? "https://" + rawApiBase
  : rawApiBase;

async function readJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export async function fetchMeta(clipId) {
  const res = await fetch(`${API_BASE}/api/clips/${encodeURIComponent(clipId)}/meta`);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || `Meta failed (${res.status})`);
  return data;
}

export async function saveClip({ clipId, password, text, expiresInSeconds, destroyOnRead }) {
  const res = await fetch(`${API_BASE}/api/clips/${encodeURIComponent(clipId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, text, expiresInSeconds, destroyOnRead }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);
  return data;
}

export async function readClip({ clipId, password }) {
  const res = await fetch(`${API_BASE}/api/clips/${encodeURIComponent(clipId)}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || `Read failed (${res.status})`);
  return data;
}

export async function uploadFiles({ clipId, password, files, onProgress }) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);

  // For large files or when progress is needed, use XMLHttpRequest
  if (onProgress && files.some(f => f.size > 10 * 1024 * 1024)) {
    return uploadWithProgress({ clipId, password, formData: fd, onProgress });
  }

  const res = await fetch(`${API_BASE}/api/clips/${encodeURIComponent(clipId)}/files`, {
    method: "POST",
    headers: { "x-clip-password": password },
    body: fd,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
  return data;
}

function uploadWithProgress({ clipId, password, formData, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/clips/${encodeURIComponent(clipId)}/files`, true);
    xhr.setRequestHeader("x-clip-password", password);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = xhr.response ? JSON.parse(xhr.response) : null;
          resolve(data || { ok: true });
        } catch {
          resolve({ ok: true });
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const err = JSON.parse(xhr.response);
          if (err.error) msg = err.error;
        } catch {}
        reject(new Error(msg));
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(formData);
  });
}

export function fileDownloadUrl({ clipId, fileId }) {
  return `${API_BASE}/api/clips/${encodeURIComponent(clipId)}/files/${encodeURIComponent(fileId)}`;
}
