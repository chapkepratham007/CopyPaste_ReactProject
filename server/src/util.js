import crypto from "crypto";

export function nowMs() {
  return Date.now();
}

export function randomId() {
  return crypto.randomUUID();
}

export function ensureDirnameSafeId(id) {
  if (typeof id !== "string") return false;
  if (id.length < 1 || id.length > 64) return false;
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export function toIntOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}
