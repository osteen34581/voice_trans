import { describe, expect, it } from 'vitest';
import {
  chunkAcademicText,
  cosineSimilarity,
  validateDocumentFile,
} from '../server/services/documentParser';
import {
  normalizeAudioMime,
  sanitizeId,
} from '../server/services/audioStorage';
import {
  markdownToSimpleHtml,
  sanitizePdfText,
} from '../lib/exporters';
import {
  base64Pcm24kToFloat32,
  downsampleFloat32,
  float32ToPcm16Base64,
} from '../lib/audioPcm';

describe('Academic Document & Audio Utilities', () => {
  it('chunks long academic text into overlapping excerpts with sequential indices', () => {
    const sample = Array.from({ length: 40 }, (_, i) => `Sentence ${i + 1} explains Kenyan constitutional devolution and public finance rules.`).join(' ');
    const chunks = chunkAcademicText(sample, 400, 60);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].sectionLabel).toBe('Excerpt 1');
    expect(chunks[1].chunkIndex).toBe(1);
    expect(chunks.every((c) => c.text.length > 0)).toBe(true);
  });

  it('returns empty array when chunking blank text', () => {
    expect(chunkAcademicText('   \n\n  ')).toEqual([]);
  });

  it('computes accurate cosine similarity between embedding vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
    expect(cosineSimilarity([], [1, 2])).toBe(0);
  });

  it('validates allowed academic document types and rejects oversized or invalid files', () => {
    expect(() =>
      validateDocumentFile({
        mimetype: 'application/pdf',
        originalname: 'lecture-notes.pdf',
        size: 1024 * 1024,
      }),
    ).not.toThrow();

    expect(() =>
      validateDocumentFile({
        mimetype: 'application/x-msdownload',
        originalname: 'malware.exe',
        size: 1024,
      }),
    ).toThrow(/Unsupported document format/);

    expect(() =>
      validateDocumentFile({
        mimetype: 'application/pdf',
        originalname: 'huge.pdf',
        size: 20 * 1024 * 1024,
      }),
    ).toThrow(/15 MB/);
  });

  it('normalizes supported lecture audio MIME types and rejects invalid formats', () => {
    expect(normalizeAudioMime('audio/webm;codecs=opus', 'rec.webm')).toBe('audio/webm');
    expect(normalizeAudioMime('audio/x-m4a', 'class.m4a')).toBe('audio/mp4');
    expect(normalizeAudioMime('application/octet-stream', 'lecture.mp3')).toBe('audio/mpeg');
    expect(() => normalizeAudioMime('video/x-msvideo', 'clip.avi')).toThrow(/Unsupported audio format/);
  });

  it('sanitizes storage identifiers and blocks path traversal characters', () => {
    expect(sanitizeId('lec_12345-abc')).toBe('lec_12345-abc');
    expect(sanitizeId('../etc/passwd')).toBe('etcpasswd');
    expect(() => sanitizeId('...')).toThrow(/Invalid identifier/);
  });

  it('converts markdown notes to structured HTML and sanitizes WinAnsi PDF punctuation', () => {
    const html = markdownToSimpleHtml('# Lecture 1\n\n- Key term\n\n1. First step\n\n> Important note');
    expect(html).toContain('<h1>Lecture 1</h1>');
    expect(html).toContain('<ul><li>Key term</li></ul>');
    expect(html).toContain('<ol><li>First step</li></ol>');
    expect(html).toContain('<blockquote><p>Important note</p></blockquote>');

    expect(sanitizePdfText('“Devolution” — Article 1 → Chapter 11')).toBe('"Devolution" -- Article 1 -> Chapter 11');
  });

  it('encodes 16kHz PCM audio with downsampling and decodes 24kHz PCM back to Float32', () => {
    const samples48k = new Float32Array(480);
    for (let i = 0; i < samples48k.length; i++) {
      samples48k[i] = Math.sin((2 * Math.PI * i) / 48) * 0.5;
    }

    const downsampled = downsampleFloat32(samples48k, 48000, 16000);
    expect(downsampled.length).toBe(160);

    const b64 = float32ToPcm16Base64(samples48k, 48000, 16000);
    expect(b64.length).toBeGreaterThan(20);

    const decoded = base64Pcm24kToFloat32(b64);
    expect(decoded.length).toBe(160);
    expect(decoded[4]).toBeCloseTo(downsampled[4], 2);
  });
});
