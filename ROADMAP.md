# Product Roadmap (Versions 1–4)

## Version 1 — Implemented MVP

- Kenyan university student academic workspace with Email & Google Auth + onboarding.
- Live browser microphone lecture recorder with crash-safe IndexedDB recovery + MP3/WAV/M4A/WebM/OGG upload.
- Server-side Gemini speech-to-text transcription (`gemini-3.5-transcribe`) with immutable raw transcripts + editable student copy.
- AI structured lecture notes generator (5 formats, 3 depths).
- TipTap rich-text academic document editor with autosave, version history, and real PDF + Microsoft Word (`.docx`) + TXT export.
- Moderated Revision Library (University &rarr; Faculty &rarr; Course &rarr; Unit &rarr; Topic), bookmarks, downloads, and reporting.
- Document-aware RAG AI Academic Tutor (`gemini-embedding-2` + `gemini-4-hydrogen`), flashcards, quizzes, mock exams, courses/reminders, student settings, and Admin Console.

## Version 2 — Enhanced Academic Collaboration & Media

- Asynchronous chunked audio pipeline for 2+ hour lectures exceeding 22 MB inline limits, with speaker diarization labels.
- Cloud Object Storage (GCS / S3) signed private media streaming for horizontal multi-instance scaling.
- Institutional OCR pipeline for scanned past-paper PDFs prior to RAG chunking.
- Kenyan university timetable & semester calendar `.ics` import/export.

## Version 3 — Native Mobile Offline Experience & Monetization

- Native Android & iOS companion apps supporting reliable background/locked-screen classroom recording with offline queue sync.
- Optional institutional SSO & university library licensing.
- M-Pesa STK Push & card checkout integration for upgraded audio/AI quotas (scaffolded in `.env.example` `MPESA_*` keys and `systemSettings/global` limits; intentionally deferred from MVP).

## Version 4 — Institutional Analytics & Peer Study Groups

- Lecturer-verified course packs and moderated faculty repositories.
- Collaborative study groups per unit code with shared flashcard decks and group mock-exam sessions.
- Adaptive spaced-repetition scheduling (SM-2) across flashcards and past-paper weak topics.
