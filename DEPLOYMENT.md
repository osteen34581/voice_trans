# Deployment & Operations Guide

## 1. Environment Variables

Configure the following variables in your hosting environment (see `.env.example` for template):

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Server-side Google Gemini API key for transcription, notes, RAG embeddings, tutor, and quiz grading. |
| `APP_URL` | Recommended | Public base URL of the deployed service. |
| `AI_PROVIDER` | Optional | Defaults to `gemini`. |
| `AI_TEXT_MODEL` | Optional | Defaults to `gemini-4-hydrogen`. |
| `AI_TRANSCRIBE_MODEL` | Optional | Defaults to `gemini-3.5-transcribe`. |
| `AI_EMBEDDING_MODEL` | Optional | Defaults to `gemini-embedding-2`. |
| `AI_LIVE_MODEL` | Optional | Defaults to `gemini-3.8-live` for real-time voice tutoring. |
| `ADMIN_EMAILS` | Optional | Comma-separated administrator emails (defaults to `austinelapi@gmail.com`). |
| `FREE_RECORDING_MINUTES` | Optional | Default monthly recording allowance (defaults to `120`). |
| `FREE_AI_MESSAGES_PER_DAY` | Optional | Default daily AI tutor allowance (defaults to `40`). |
| `FREE_STORAGE_LIMIT_MB` | Optional | Default workspace storage allowance (defaults to `250`). |

## 2. Production Build & Start

1. Build the Vite client bundle into `dist/`:
   ```bash
   npm run build
   ```
2. Start the production Express + WebSocket server on port `3000`:
   ```bash
   NODE_ENV=production npm start
   ```
   `server.ts` serves static assets from `dist/`, bridges real-time voice WebSockets at `/api/live/ws`, and routes all unmatched GET requests to `dist/index.html` while handling `/api/*` endpoints.

## 3. Firebase Configuration & Security Rules

- Project configuration lives in `firebase-applet-config.json`.
- Always validate `firestore.rules` before deploying:
  ```bash
  npm run lint:rules
  ```
- Deploy updated rules via Firebase CLI (`firebase deploy --only firestore:rules`) or the platform deployment flow.

## 4. Persistent Audio Storage Note

In single-container preview/development deployments, private lecture audio is written to `./storage/audio/<uid>/`. For multi-instance horizontal scaling in production (Cloud Run / Kubernetes), mount a persistent volume or swap `src/server/services/audioStorage.ts` to Google Cloud Storage / S3 signed private object reads using the same `savePrivateAudio` / `findPrivateAudio` / `deletePrivateAudio` interface.
