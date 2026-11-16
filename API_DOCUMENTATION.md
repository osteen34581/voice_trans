# API Documentation

All backend endpoints are served from Express (`server.ts`) under `/api/*`. Protected endpoints require a valid Firebase ID token in the `Authorization: Bearer <token>` header with a verified email address.

---

## Health & Configuration

### `GET /api/health`
Public liveness probe.
- **Response (`200`)**: `{ "status": "ok", "timestamp": "ISO-8601" }`

### `GET /api/config`
Returns non-secret AI provider and default freemium configuration.
- **Response (`200`)**:
```json
{
  "aiProvider": "gemini",
  "textModel": "gemini-4-hydrogen",
  "transcribeModel": "gemini-3.5-transcribe",
  "embeddingModel": "gemini-embedding-2",
  "geminiConfigured": true,
  "defaultLimits": {
    "freeRecordingMinutes": 120,
    "freeAiMessagesPerDay": 40,
    "freeStorageLimitMb": 250
  }
}
```

### `GET /api/auth/me` (Auth Required)
Verifies the Firebase ID token and reports administrator status (`isAdmin`).

---

## Private Audio Storage

### `POST /api/audio/upload` (Auth Required, Rate Limited: 20/min)
Uploads multipart form data (`audio` file + `lectureId`). Files up to 50 MB (MP3, WAV, M4A, WebM, OGG) are stored privately under `./storage/audio/<uid>/<lectureId>.<ext>`.

### `GET /api/audio/:lectureId` (Auth Required)
Streams private lecture audio belonging strictly to `req.user.uid` with HTTP byte-range (`206 Partial Content`) seeking support and `Cache-Control: private, no-store`.

### `DELETE /api/audio/:lectureId` (Auth Required)
Deletes the caller's stored audio file for `lectureId`.

---

## AI Services (`@google/genai` Server-Side)

### `POST /api/ai/transcribe` (Auth Required, Rate Limited: 10/min)
Accepts multipart audio upload or references an already-uploaded `lectureId`. Returns verbatim academic speech-to-text output (`transcript`, `languageDetected`, `uncertaintyNotes`, `modelUsed`). Inline payload cap is 22 MB.

### `POST /api/ai/generate-notes` (Auth Required, Rate Limited: 15/min)
- **Body**: `{ transcript, title, unitCode?, unitName?, format, summaryLength }`
- **Response (`200`)**: `{ "contentMarkdown": "...", "modelUsed": "gemini-4-hydrogen" }`

### `POST /api/documents/extract-and-embed` (Auth Required, Rate Limited: 15/min)
Accepts multipart `file` (PDF, DOCX, TXT, MD; max 15 MB). Extracts plain text, splits into overlapping sections, and computes embeddings via `gemini-embedding-2` (gracefully falling back to keyword-scored chunks if embedding API is unavailable).

### `POST /api/ai/tutor` (Auth Required, Rate Limited: 25/min)
- **Body**: `{ question, teachingMode, unitCode?, history, chunks }`
- Computes cosine similarity against chunk embeddings (or keyword overlap fallback), injects top 5 relevant excerpts into the prompt, and returns `{ answer, citationsSummary, modelUsed }`.

### `POST /api/ai/generate-quiz` (Auth Required, Rate Limited: 12/min)
- **Body**: `{ sourceText, unitCode?, topic?, difficulty, questionCount, mode }`
- Returns structured JSON array of `mcq`, `true_false`, `short_answer`, and `structured` questions with marks and reference explanations.

### `POST /api/ai/grade-quiz` (Auth Required, Rate Limited: 20/min)
- **Body**: `{ questions, answers }`
- Grades `mcq` and `true_false` deterministically on the server; evaluates `short_answer` and `structured` responses using Gemini rubric scoring (`score`, `maxScore`, `results`).

### `POST /api/ai/generate-flashcards` (Auth Required, Rate Limited: 12/min)
- **Body**: `{ sourceText, topic?, count }`
- Returns `{ flashcards: [{ front, back, topic }] }`.

---

## Administrator Verification

### `GET /api/admin/verify` (Auth + Admin Required)
Verifies both `email_verified` and administrator authorization (`ADMIN_EMAILS` / Firestore `/admins/{uid}`). Returns `403` for non-admin accounts.
