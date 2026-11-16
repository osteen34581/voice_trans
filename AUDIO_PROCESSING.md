# Audio Recording, Storage & Transcription Pipeline

## 1. Live Classroom Recording (`RecordLectureView.tsx`)

- Uses browser `navigator.mediaDevices.getUserMedia({ audio: true })` and `MediaRecorder` with echo cancellation, noise suppression, and auto-gain control enabled when supported by the microphone driver.
- Selects `audio/webm;codecs=opus` when supported (falling back to browser default MIME).
- Streams Web Audio `AnalyserNode` frequency magnitudes to display real-time microphone activity and elapsed duration (`HH:MM:SS` / `MM:SS`).
- Supports **Start**, **Pause**, **Resume**, **Stop**, **Local Preview**, and **Re-record** controls.

### Crash-Safe Local Draft Recovery (`src/lib/indexedDbAudio.ts`)
- Every 4 seconds during active recording, collected audio chunks are persisted to IndexedDB (`aa_audio_drafts`) so a browser refresh or accidental navigation allows the student to recover or discard their unsaved recording.

### Browser Technical Limits (Disclosed in UI)
- Recording runs reliably while the browser tab remains open and active.
- Locked-screen or OS background recording on mobile browsers is not guaranteed without a native mobile application.
- Online meetings (Zoom, Google Meet, Microsoft Teams) are not captured automatically without explicit user microphone/device routing and classroom consent.

## 2. Uploaded Audio Support

- Students can upload existing lecture files in **MP3, WAV, M4A, WebM, and OGG** formats (up to 50 MB for private storage; up to 22 MB inline transcription payload).
- Metadata (unit, lecturer, lecture title, date, optional notes) is attached before saving.

## 3. Private Audio Storage & Playback (`src/server/services/audioStorage.ts`)

- Stored outside public web directories at `./storage/audio/<uid>/<lectureId>.<ext>`.
- Identifiers are strictly sanitized (`sanitizeId`) to prevent path traversal.
- Playback occurs strictly through `GET /api/audio/:lectureId` with a verified Firebase Bearer ID token, supporting HTTP `Range` (`206 Partial Content`) requests for seeking and `Cache-Control: private, no-store`.
- Students can delete their private recordings anytime (`DELETE /api/audio/:lectureId` + Firestore `lectures/{id}` deletion).

## 4. Transcription Lifecycle & Immutability

1. Lecture document created in Firestore with `transcriptionStatus: "uploaded"` -> `"processing"` -> `"completed"` (or `"failed"` with `transcriptionError` and retry support).
2. `POST /api/ai/transcribe` sends audio to `gemini-3.5-transcribe`.
3. Saved `transcripts/{id}` stores both `rawText` (immutable per `firestore.rules` so original AI output cannot be overwritten) and `editedText` (freely editable by the student).
