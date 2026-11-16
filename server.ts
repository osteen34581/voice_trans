import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { z } from 'zod';
import { createServer as createViteServer } from 'vite';
import { getServerConfig } from './src/server/config.ts';
import { requireAuth, requireAdmin, rateLimit, type AuthRequest } from './src/server/middleware/auth.ts';
import { aiProvider, type QuizQuestionItem } from './src/server/ai/provider.ts';
import { attachLiveVoiceWebSocket } from './src/server/ai/liveBridge.ts';
import {
  savePrivateAudio,
  findPrivateAudio,
  deletePrivateAudio,
  normalizeAudioMime,
} from './src/server/services/audioStorage.ts';
import {
  validateDocumentFile,
  extractDocumentText,
  chunkAcademicText,
  cosineSimilarity,
} from './src/server/services/documentParser.ts';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const uploadDoc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// Public health & non-secret configuration check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/config', (_req, res) => {
  const cfg = getServerConfig();
  res.json({
    aiProvider: cfg.aiProvider,
    textModel: cfg.textModel,
    transcribeModel: cfg.transcribeModel,
    embeddingModel: cfg.embeddingModel,
    liveModel: cfg.liveModel,
    geminiConfigured: cfg.geminiConfigured,
    defaultLimits: cfg.defaultLimits,
  });
});

app.get('/api/auth/me', requireAuth, (req: AuthRequest, res) => {
  const { adminEmails } = getServerConfig();
  const email = req.user?.email?.toLowerCase() || '';
  const isAdmin = Boolean(req.user?.email_verified && adminEmails.includes(email));
  res.json({
    uid: req.user?.uid,
    email: req.user?.email,
    emailVerified: req.user?.email_verified,
    isAdmin,
  });
});

// Private authenticated lecture audio upload
app.post(
  '/api/audio/upload',
  requireAuth,
  rateLimit(20, 60_000),
  uploadAudio.single('audio'),
  (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const lectureId = typeof req.body?.lectureId === 'string' ? req.body.lectureId : '';
      if (!lectureId) {
        res.status(400).json({ error: 'Missing lectureId.' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No audio file uploaded.' });
        return;
      }

      const safeOriginalName = req.file.originalname || `${lectureId}.webm`;
      const { normalizedMime } = savePrivateAudio(
        uid,
        lectureId,
        req.file.buffer,
        req.file.mimetype,
        safeOriginalName,
      );

      res.json({
        lectureId,
        audioFileName: safeOriginalName,
        audioMimeType: normalizedMime,
        audioSizeBytes: req.file.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to store lecture audio.';
      res.status(400).json({ error: message });
    }
  },
);

// Private authenticated lecture audio playback stream
app.get('/api/audio/:lectureId', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const lectureIdParam = String(req.params.lectureId || '');
    const found = findPrivateAudio(uid, lectureIdParam);
    if (!found) {
      res.status(404).json({ error: 'Audio recording not found for this account.' });
      return;
    }

    const stat = fs.statSync(found.filePath);
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': found.mimeType,
        'Cache-Control': 'private, no-store',
      });
      fs.createReadStream(found.filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Length': stat.size,
      'Content-Type': found.mimeType,
      'Cache-Control': 'private, no-store',
    });
    fs.createReadStream(found.filePath).pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read lecture audio.';
    res.status(400).json({ error: message });
  }
});

app.delete('/api/audio/:lectureId', requireAuth, (req: AuthRequest, res) => {
  try {
    const uid = req.user!.uid;
    const lectureIdParam = String(req.params.lectureId || '');
    const deleted = deletePrivateAudio(uid, lectureIdParam);
    res.json({ deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete lecture audio.';
    res.status(400).json({ error: message });
  }
});

// Speech-to-Text Transcription Endpoint (Gemini 3.5 Transcribe)
app.post(
  '/api/ai/transcribe',
  requireAuth,
  rateLimit(10, 60_000),
  uploadAudio.single('audio'),
  async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      const lectureId = typeof req.body?.lectureId === 'string' ? req.body.lectureId : '';
      const lectureTitle = typeof req.body?.lectureTitle === 'string' ? req.body.lectureTitle : '';
      const unitCode = typeof req.body?.unitCode === 'string' ? req.body.unitCode : '';
      const languageHint = typeof req.body?.languageHint === 'string' ? req.body.languageHint : '';

      let audioBuffer: Buffer | null = null;
      let mimeType = 'audio/webm';

      if (req.file) {
        mimeType = normalizeAudioMime(req.file.mimetype, req.file.originalname);
        audioBuffer = req.file.buffer;
        if (lectureId) {
          savePrivateAudio(uid, lectureId, audioBuffer, mimeType, req.file.originalname);
        }
      } else if (lectureId) {
        const stored = findPrivateAudio(uid, lectureId);
        if (stored) {
          audioBuffer = fs.readFileSync(stored.filePath);
          mimeType = stored.mimeType;
        }
      }

      if (!audioBuffer) {
        res.status(400).json({ error: 'No audio recording found. Upload or record audio first.' });
        return;
      }

      if (audioBuffer.length > 22 * 1024 * 1024) {
        res.status(400).json({
          error: 'Audio exceeds inline transcription payload limit (22 MB). Split long lectures into smaller segments.',
        });
        return;
      }

      const result = await aiProvider.transcribeAudio({
        audioBase64: audioBuffer.toString('base64'),
        mimeType,
        lectureTitle,
        unitCode,
        languageHint,
      });

      res.json(result);
    } catch (error) {
      console.error('Transcription error:', error);
      const message = error instanceof Error ? error.message : 'Audio transcription failed.';
      res.status(500).json({ error: message });
    }
  },
);

// AI Structured Lecture Notes Generator
const generateNotesSchema = z.object({
  transcript: z.string().min(20, 'Transcript must contain at least 20 characters.'),
  title: z.string().min(2).max(200),
  unitCode: z.string().max(32).optional(),
  unitName: z.string().max(160).optional(),
  format: z.string().min(2).max(60).default('detailed_notes'),
  summaryLength: z.enum(['brief', 'standard', 'detailed']).default('standard'),
});

app.post('/api/ai/generate-notes', requireAuth, rateLimit(15, 60_000), async (req: AuthRequest, res) => {
  try {
    const parsed = generateNotesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input.' });
      return;
    }
    const result = await aiProvider.generateLectureNotes(parsed.data);
    res.json(result);
  } catch (error) {
    console.error('Generate notes error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate notes.' });
  }
});

// Document Text Extraction + Chunking + Gemini Embeddings for RAG
app.post(
  '/api/documents/extract-and-embed',
  requireAuth,
  rateLimit(15, 60_000),
  uploadDoc.single('file'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No document file uploaded.' });
        return;
      }
      validateDocumentFile(req.file);

      const extractedText = await extractDocumentText(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname,
      );

      if (!extractedText || extractedText.length < 20) {
        res.status(400).json({
          error: 'Could not extract readable text from this file. Scanned image-only PDFs require OCR before indexing.',
        });
        return;
      }

      const chunks = chunkAcademicText(extractedText);
      let embeddings: number[][] = [];
      try {
        embeddings = await aiProvider.embedTexts(chunks.map((c) => c.text));
      } catch (embErr) {
        console.warn('Embedding fallback to keyword scoring:', embErr);
        embeddings = chunks.map(() => []);
      }

      res.json({
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        extractedPreview: extractedText.slice(0, 600),
        chunks: chunks.map((chunk, i) => ({
          ...chunk,
          embedding: embeddings[i] || [],
        })),
      });
    } catch (error) {
      console.error('Document extraction error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Document processing failed.' });
    }
  },
);

// Grounded AI Academic Tutor Chat
const tutorSchema = z.object({
  question: z.string().min(2).max(4000),
  teachingMode: z.enum(['beginner', 'intermediate', 'advanced', 'exam']).default('intermediate'),
  unitCode: z.string().max(32).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(12000),
      }),
    )
    .max(20)
    .default([]),
  chunks: z
    .array(
      z.object({
        materialTitle: z.string().max(200),
        sectionLabel: z.string().max(120),
        text: z.string().max(8000),
        embedding: z.array(z.number()).optional(),
      }),
    )
    .max(120)
    .default([]),
});

app.post('/api/ai/tutor', requireAuth, rateLimit(25, 60_000), async (req: AuthRequest, res) => {
  try {
    const parsed = tutorSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid tutor request.' });
      return;
    }

    const { question, history, teachingMode, unitCode, chunks } = parsed.data;
    let selectedChunks = chunks.slice(0, 5);

    if (chunks.length > 0) {
      const hasEmbeddings = chunks.some((c) => Array.isArray(c.embedding) && c.embedding.length > 0);
      if (hasEmbeddings) {
        try {
          const [queryEmbedding] = await aiProvider.embedTexts([question]);
          if (queryEmbedding?.length) {
            selectedChunks = [...chunks]
              .sort(
                (a, b) =>
                  cosineSimilarity(queryEmbedding, b.embedding || []) -
                  cosineSimilarity(queryEmbedding, a.embedding || []),
              )
              .slice(0, 5);
          }
        } catch {
          // Fallback to keyword overlap scoring below
        }
      }

      if (!hasEmbeddings) {
        const keywords = question
          .toLowerCase()
          .split(/\W+/)
          .filter((w) => w.length > 3);
        selectedChunks = [...chunks]
          .sort((a, b) => {
            const scoreA = keywords.reduce((acc, kw) => acc + (a.text.toLowerCase().includes(kw) ? 1 : 0), 0);
            const scoreB = keywords.reduce((acc, kw) => acc + (b.text.toLowerCase().includes(kw) ? 1 : 0), 0);
            return scoreB - scoreA;
          })
          .slice(0, 5);
      }
    }

    const reply = await aiProvider.tutorChat({
      question,
      history,
      teachingMode,
      unitCode,
      retrievedChunks: selectedChunks.map((c) => ({
        materialTitle: c.materialTitle,
        sectionLabel: c.sectionLabel,
        text: c.text,
      })),
    });

    res.json(reply);
  } catch (error) {
    console.error('AI tutor error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'AI Tutor failed to respond.' });
  }
});

// Quiz & Mock Exam Generator
const quizGenerateSchema = z.object({
  sourceText: z.string().min(30, 'Provide at least 30 characters of study material to generate questions.'),
  unitCode: z.string().max(32).optional(),
  topic: z.string().max(160).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced', 'exam']).default('intermediate'),
  questionCount: z.number().int().min(2).max(20).default(5),
  mode: z.enum(['quiz', 'mock_exam']).default('quiz'),
});

app.post('/api/ai/generate-quiz', requireAuth, rateLimit(12, 60_000), async (req: AuthRequest, res) => {
  try {
    const parsed = quizGenerateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid quiz parameters.' });
      return;
    }
    const result = await aiProvider.generateQuiz(parsed.data);
    res.json(result);
  } catch (error) {
    console.error('Quiz generation error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate quiz.' });
  }
});

// Quiz Grading (Deterministic for MCQ/True-False + AI-Assisted for Short/Structured)
const gradeQuizSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['mcq', 'true_false', 'short_answer', 'structured']),
      question: z.string(),
      options: z.array(z.string()).optional(),
      correctAnswer: z.string(),
      explanation: z.string(),
      marks: z.number().min(1).max(20),
    }),
  ),
  answers: z.record(z.string(), z.string()),
});

app.post('/api/ai/grade-quiz', requireAuth, rateLimit(20, 60_000), async (req: AuthRequest, res) => {
  try {
    const parsed = gradeQuizSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid quiz submission payload.' });
      return;
    }

    const { questions, answers } = parsed.data;
    const subjectiveItems: Array<{
      id: string;
      question: string;
      expectedAnswer: string;
      studentAnswer: string;
      maxMarks: number;
    }> = [];

    for (const q of questions) {
      if (q.type === 'short_answer' || q.type === 'structured') {
        subjectiveItems.push({
          id: q.id,
          question: q.question,
          expectedAnswer: q.correctAnswer,
          studentAnswer: answers[q.id] || '',
          maxMarks: q.marks,
        });
      }
    }

    const aiSubjectiveGrades = await aiProvider.gradeSubjectiveAnswers(subjectiveItems);
    const aiGradeMap = new Map(aiSubjectiveGrades.map((g) => [g.id, g]));

    let totalScore = 0;
    let maxScore = 0;

    const results = questions.map((q: QuizQuestionItem) => {
      const studentAns = (answers[q.id] || '').trim();
      maxScore += q.marks;

      if (q.type === 'mcq' || q.type === 'true_false') {
        const isCorrect = studentAns.toLowerCase() === q.correctAnswer.trim().toLowerCase();
        const awardedMarks = isCorrect ? q.marks : 0;
        totalScore += awardedMarks;
        return {
          id: q.id,
          question: q.question,
          studentAnswer: studentAns || '(No answer)',
          correctAnswer: q.correctAnswer,
          awardedMarks,
          maxMarks: q.marks,
          isCorrect,
          feedback: q.explanation,
        };
      }

      const aiGrade = aiGradeMap.get(q.id);
      const awardedMarks = aiGrade ? Math.min(q.marks, Math.max(0, Math.round(aiGrade.awardedMarks * 10) / 10)) : 0;
      totalScore += awardedMarks;
      return {
        id: q.id,
        question: q.question,
        studentAnswer: studentAns || '(No answer)',
        correctAnswer: q.correctAnswer,
        awardedMarks,
        maxMarks: q.marks,
        isCorrect: awardedMarks >= q.marks * 0.6,
        feedback: aiGrade?.feedback || q.explanation,
      };
    });

    res.json({
      score: Math.round(totalScore * 10) / 10,
      maxScore,
      results,
    });
  } catch (error) {
    console.error('Quiz grading error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to grade quiz.' });
  }
});

// Flashcard Generator
const flashcardGenSchema = z.object({
  sourceText: z.string().min(30),
  topic: z.string().max(160).optional(),
  count: z.number().int().min(2).max(20).default(6),
});

app.post('/api/ai/generate-flashcards', requireAuth, rateLimit(12, 60_000), async (req: AuthRequest, res) => {
  try {
    const parsed = flashcardGenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Provide study content (min 30 chars) to generate flashcards.' });
      return;
    }
    const result = await aiProvider.generateFlashcards(parsed.data);
    res.json(result);
  } catch (error) {
    console.error('Flashcard generation error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate flashcards.' });
  }
});

// Admin verification ping
app.get('/api/admin/verify', requireAuth, requireAdmin, (req: AuthRequest, res) => {
  res.json({ verified: true, adminEmail: req.user?.email });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  attachLiveVoiceWebSocket(httpServer);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Academic Assistant server listening on http://localhost:${PORT}`);
  });
}

startServer();
