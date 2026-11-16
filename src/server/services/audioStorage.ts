import fs from 'fs';
import path from 'path';

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'audio');

const ALLOWED_AUDIO_MIMES = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/mp3',
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/ogg',
]);

export function sanitizeId(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9_-]/g, '');
  if (!clean || clean.length > 128) {
    throw new Error('Invalid identifier.');
  }
  return clean;
}

export function normalizeAudioMime(mime: string, fileName: string): string {
  const base = mime.split(';')[0].trim().toLowerCase();
  if (ALLOWED_AUDIO_MIMES.has(base)) {
    return base === 'audio/m4a' || base === 'audio/x-m4a' ? 'audio/mp4' : base;
  }
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  throw new Error('Unsupported audio format. Supported formats: MP3, WAV, M4A, WebM, and OGG.');
}

function getExtensionForMime(mime: string): string {
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

export function savePrivateAudio(
  uid: string,
  lectureId: string,
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): { normalizedMime: string; storedPath: string } {
  const safeUid = sanitizeId(uid);
  const safeLectureId = sanitizeId(lectureId);
  const normalizedMime = normalizeAudioMime(mimeType, fileName);
  const ext = getExtensionForMime(normalizedMime);

  const userDir = path.join(STORAGE_ROOT, safeUid);
  fs.mkdirSync(userDir, { recursive: true });

  // Remove any older extension for this lectureId
  for (const oldExt of ['webm', 'mp3', 'wav', 'm4a', 'ogg']) {
    const candidate = path.join(userDir, `${safeLectureId}.${oldExt}`);
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
    }
  }

  const targetPath = path.join(userDir, `${safeLectureId}.${ext}`);
  fs.writeFileSync(targetPath, buffer);
  return { normalizedMime, storedPath: targetPath };
}

export function findPrivateAudio(uid: string, lectureId: string): { filePath: string; mimeType: string } | null {
  const safeUid = sanitizeId(uid);
  const safeLectureId = sanitizeId(lectureId);
  const userDir = path.join(STORAGE_ROOT, safeUid);
  if (!fs.existsSync(userDir)) return null;

  const map: Array<{ ext: string; mime: string }> = [
    { ext: 'webm', mime: 'audio/webm' },
    { ext: 'mp3', mime: 'audio/mpeg' },
    { ext: 'wav', mime: 'audio/wav' },
    { ext: 'm4a', mime: 'audio/mp4' },
    { ext: 'ogg', mime: 'audio/ogg' },
  ];

  for (const entry of map) {
    const candidate = path.join(userDir, `${safeLectureId}.${entry.ext}`);
    if (fs.existsSync(candidate)) {
      return { filePath: candidate, mimeType: entry.mime };
    }
  }
  return null;
}

export function deletePrivateAudio(uid: string, lectureId: string): boolean {
  const found = findPrivateAudio(uid, lectureId);
  if (found && fs.existsSync(found.filePath)) {
    fs.unlinkSync(found.filePath);
    return true;
  }
  return false;
}
