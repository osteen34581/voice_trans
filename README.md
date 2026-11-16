# AI Academic Assistant

An academic workspace built primarily for **Kenyan university students**, supporting live classroom audio recording, lecture audio uploads, AI speech-to-text transcription, structured lecture note generation, rich-text document editing with genuine PDF and Microsoft Word (`.docx`) export, a moderated Revision Library, a document-grounded AI Academic Tutor (RAG), flashcards, quizzes/mock exams, course & reminder organization, and a protected Administrator Console.

---

## Core Capabilities

- **Authentication & Onboarding**: Email/password sign-up (with email verification), Google Sign-In, password reset, and academic onboarding (university, faculty/school, course/programme, year of study, semester, recording & data protection consent).
- **Live Lecture Recorder & Audio Upload**: Browser `MediaRecorder` live recording with start/pause/resume/stop controls, elapsed timer, level visualization, IndexedDB local crash-recovery draft storage, and private audio upload (MP3, WAV, M4A, WebM, OGG).
- **Speech-to-Text & Editable Transcripts**: Server-side transcription via Gemini (`gemini-3.5-transcribe`), preserving an immutable `rawText` transcript alongside student-editable `editedText`, detected language, uncertainty notes, and search/copy controls.
- **AI Lecture Notes Generator**: Converts transcripts or custom text into 5 academic formats (Detailed Lecture Notes, Short Summary, Concepts & Definitions, Examples/Formulas/Dates, Revision Points) at Brief, Standard, or Detailed depth.
- **Rich-Text Academic Document Editor**: TipTap editor with headings, lists, highlights, tables, links, alignment, find & replace, autosave, version history snapshots, and real client-side downloads in **PDF** (`jspdf`), **Word (`.docx`)** (`docx`), **TXT**, and Print view—with optional toggleable university/course/unit headers.
- **Moderated Revision Library**: Structured by University &rarr; Faculty &rarr; Course &rarr; Unit &rarr; Topic with search, filters, bookmarks, downloads, flagging/reporting, and administrator approval before student submissions become public.
- **Document-Aware AI Tutor (RAG)**: Upload PDF, DOCX, TXT, or MD study materials; the server extracts text (`unpdf` / `mammoth`), chunks into overlapping excerpts, generates embeddings (`gemini-embedding-2`), retrieves top matches by cosine similarity, and answers with section citations across Beginner, Intermediate, Advanced, and University Exam modes.
- **Revision Tools**: AI-generated and manual flashcards with mastery tracking (`new`, `known`, `difficult`, `review`), plus Objective + Structured Quizzes and Timed Mock Exams with deterministic + AI rubric grading.
- **Protected Administrator Console**: Server-verified admin access (`GET /api/admin/verify` + Firestore `isAdmin()`) to manage student accounts, moderate library resources, resolve reports, maintain Kenyan university/course directories, configure platform branding/freemium limits, and inspect audit logs.

---

## Tech Stack

- **Frontend**: React 19, Vite 8, TypeScript, Tailwind CSS v4, TipTap, Lucide Icons
- **Backend Server**: Express (`server.ts` on port `3000`, serving Vite middlewares in development and `dist/` in production)
- **Database & Auth**: Firebase Authentication & Cloud Firestore (`firebase` client SDK + `firebase-admin` token verification)
- **AI Engine**: Server-side `@google/genai` SDK (`GEMINI_API_KEY` environment secret)
- **Document Export & Extraction**: `jspdf`, `docx`, `file-saver`, `unpdf`, `mammoth`

---

## Local Development & Verification

1. Copy `.env.example` to `.env` (or configure environment variables in your host):
   ```bash
   cp .env.example .env
   ```
   Set `GEMINI_API_KEY` in environment secrets. Never expose `GEMINI_API_KEY` in client code.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the full-stack dev server on `http://localhost:3000`:
   ```bash
   npm run dev
   ```
4. Run TypeScript checks, Firestore rules linting, production build, and unit tests:
   ```bash
   npm run lint
   npm run lint:rules
   npm test
   npm run build
   ```

---

## Honest Platform Boundaries

- **Browser Recording**: Live recording works while the browser tab remains open and active. Locked-screen or OS background recording on mobile is not guaranteed by web browsers and requires a future native mobile build.
- **Classroom Audio Capture**: Online classes (Zoom/Google Meet/Teams) are not captured automatically without explicit user microphone/device sharing and classroom permission.
- **Billing / M-Pesa**: Freemium allowances are configurable in `systemSettings/global`; payment/M-Pesa checkout is intentionally deferred to future releases and is not simulated.
