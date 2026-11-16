/**
 * PCM Audio conversion utilities for Gemini Live API:
 * - Browser microphone input: resamples Float32 to 16kHz signed 16-bit little-endian PCM (base64)
 * - Gemini Live output: decodes 24kHz signed 16-bit little-endian PCM (base64) to Float32Array
 */

export function downsampleFloat32(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate = 16000,
): Float32Array {
  if (!input.length || sourceSampleRate <= 0 || sourceSampleRate === targetSampleRate) {
    return input;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    if (end <= start) {
      output[i] = input[Math.min(start, input.length - 1)] || 0;
    } else {
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += input[j];
      }
      output[i] = sum / (end - start);
    }
  }

  return output;
}

export function float32ToPcm16Base64(
  input: Float32Array,
  sourceSampleRate = 16000,
  targetSampleRate = 16000,
): string {
  const resampled = downsampleFloat32(input, sourceSampleRate, targetSampleRate);
  const bytes = new Uint8Array(resampled.length * 2);
  const view = new DataView(bytes.buffer);

  for (let i = 0; i < resampled.length; i++) {
    const clamped = Math.max(-1, Math.min(1, resampled[i]));
    const int16 = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
    view.setInt16(i * 2, int16, true);
  }

  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64Pcm24kToFloat32(base64: string): Float32Array {
  if (!base64) return new Float32Array(0);
  const binary = atob(base64);
  const byteLength = binary.length;
  const sampleCount = Math.floor(byteLength / 2);
  const bytes = new Uint8Array(sampleCount * 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    float32[i] = view.getInt16(i * 2, true) / 32768;
  }
  return float32;
}
