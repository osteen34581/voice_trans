import mammoth from 'mammoth';
import { extractText } from 'unpdf';

export interface TextChunk {
  chunkIndex: number;
  sectionLabel: string;
  text: string;
}

const ALLOWED_DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

export function validateDocumentFile(file: { mimetype: string; originalname: string; size: number }) {
  const lower = file.originalname.toLowerCase();
  const validExt =
    lower.endsWith('.pdf') ||
    lower.endsWith('.docx') ||
    lower.endsWith('.txt') ||
    lower.endsWith('.md');

  if (!ALLOWED_DOCUMENT_MIMES.has(file.mimetype) && !validExt) {
    throw new Error('Unsupported document format. Allowed formats: PDF, DOCX, TXT, and MD.');
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Document exceeds the 15 MB upload limit.');
  }
}

export async function extractDocumentText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const lower = fileName.toLowerCase();

  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    const uint8 = new Uint8Array(buffer);
    const result = await extractText(uint8, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join('\n\n') : String(result.text || '');
    return text.trim();
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || '').trim();
  }

  return buffer.toString('utf-8').trim();
}

export function chunkAcademicText(rawText: string, chunkSize = 1100, overlap = 180): TextChunk[] {
  const cleaned = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!cleaned) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let cursor = 0;
  let idx = 0;

  while (cursor < cleaned.length && idx < 120) {
    let end = Math.min(cursor + chunkSize, cleaned.length);
    if (end < cleaned.length) {
      const lastPeriod = cleaned.lastIndexOf('.', end);
      const lastNewline = cleaned.lastIndexOf('\n', end);
      const splitPoint = Math.max(lastPeriod, lastNewline);
      if (splitPoint > cursor + Math.floor(chunkSize * 0.5)) {
        end = splitPoint + 1;
      }
    }

    const slice = cleaned.slice(cursor, end).trim();
    if (slice.length > 0) {
      chunks.push({
        chunkIndex: idx,
        sectionLabel: `Excerpt ${idx + 1}`,
        text: slice,
      });
      idx += 1;
    }

    if (end >= cleaned.length) {
      break;
    }
    cursor = Math.max(end - overlap, cursor + 1);
  }

  return chunks;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
