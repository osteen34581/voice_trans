import { GoogleGenAI, Type } from '@google/genai';
import { getServerConfig } from '../config.ts';

export interface TranscribeInput {
  audioBase64: string;
  mimeType: string;
  lectureTitle?: string;
  unitCode?: string;
  languageHint?: string;
}

export interface TranscribeOutput {
  rawText: string;
  languageDetected: string;
  uncertaintyNotes: string;
  modelUsed: string;
}

export interface GenerateNotesInput {
  transcript: string;
  title: string;
  unitCode?: string;
  unitName?: string;
  format: string;
  summaryLength: 'brief' | 'standard' | 'detailed';
}

export interface TutorMessageHistory {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorChunkContext {
  materialTitle: string;
  sectionLabel: string;
  text: string;
}

export interface TutorChatInput {
  question: string;
  history: TutorMessageHistory[];
  teachingMode: 'beginner' | 'intermediate' | 'advanced' | 'exam';
  unitCode?: string;
  retrievedChunks: TutorChunkContext[];
}

export interface QuizQuestionItem {
  id: string;
  type: 'mcq' | 'true_false' | 'short_answer' | 'structured';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  marks: number;
}

export interface FlashcardItem {
  front: string;
  back: string;
  topic: string;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured in server Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

export class GeminiAcademicProvider {
  async transcribeAudio(input: TranscribeInput): Promise<TranscribeOutput> {
    const cfg = getServerConfig();
    const ai = getGeminiClient();

    const prompt = [
      'Transcribe this university lecture recording faithfully and accurately.',
      'Context:',
      input.lectureTitle ? `- Lecture Title: ${input.lectureTitle}` : '',
      input.unitCode ? `- Unit Code: ${input.unitCode}` : '',
      input.languageHint ? `- Expected Accent/Language: ${input.languageHint}` : '- Context: Kenyan university lecture (Kenyan English, possibly occasional Swahili phrases).',
      '',
      'Rules:',
      '1. Organize into readable paragraphs with approximate timestamps like [00:15] where clear.',
      '2. If multiple speakers appear, label neutrally as "Speaker 1:" / "Speaker 2:" without inventing names.',
      '3. Mark genuinely inaudible or ambiguous words as [unclear] instead of guessing.',
      '4. Preserve technical terminology, formulas, and Kenyan legal/academic terms.',
    ]
      .filter(Boolean)
      .join('\n');

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: cfg.transcribeModel,
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.audioBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              transcript: { type: Type.STRING, description: 'Full verbatim lecture transcript with paragraphs.' },
              languageDetected: { type: Type.STRING, description: 'Detected language(s) e.g. English (Kenya).' },
              uncertaintyNotes: { type: Type.STRING, description: 'Notes on unclear sections or audio quality issues.' },
            },
            required: ['transcript', 'languageDetected', 'uncertaintyNotes'],
          },
        },
      }),
    );

    const parsed = JSON.parse((response.text ?? '{}').trim() || '{}');
    return {
      rawText: parsed.transcript || '',
      languageDetected: parsed.languageDetected || 'English',
      uncertaintyNotes: parsed.uncertaintyNotes || 'No major audio uncertainties flagged.',
      modelUsed: cfg.transcribeModel,
    };
  }

  async generateLectureNotes(input: GenerateNotesInput): Promise<{ contentMarkdown: string; modelUsed: string }> {
    const cfg = getServerConfig();
    const ai = getGeminiClient();

    const lengthInstruction =
      input.summaryLength === 'brief'
        ? 'Keep explanations concise and crisp (bullet-focused executive study guide).'
        : input.summaryLength === 'detailed'
          ? 'Produce comprehensive, university-level detailed notes preserving all technical derivations, examples, and nuances.'
          : 'Produce balanced, well-structured university study notes with clear headings and explanations.';

    const systemInstruction = `You are a rigorous Kenyan university academic note-taking assistant.
Convert the provided lecture transcript into organized Markdown study notes.
Strict academic integrity rules:
- Preserve the lecturer's intended meaning and technical terminology.
- Never invent facts, citations, or formulas not supported by the lecture.
- Clearly distinguish [From Lecture] concepts from any [Clarifying Note] you add.
- Flag any [Unclear in Transcript] points rather than guessing.
- If generating revision questions, label them explicitly as "Practice Revision Questions (For Self-Testing — Not Exam Predictions)".
- Requested output focus: ${input.format}.
- Depth: ${lengthInstruction}`;

    const prompt = [
      `Lecture Title: ${input.title}`,
      input.unitCode ? `Unit: ${input.unitCode} ${input.unitName || ''}` : '',
      '',
      'Required Markdown Structure:',
      '# Title & Lecture Overview',
      '## Introduction',
      '## Main Concepts & Detailed Explanations',
      '## Key Definitions & Terminology',
      '## Important Examples, Formulas & Dates (if mentioned)',
      '## Key Takeaways & Revision Points',
      '## Practice Revision Questions',
      '',
      '--- TRANSCRIPT ---',
      input.transcript.slice(0, 120000),
    ]
      .filter(Boolean)
      .join('\n');

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: cfg.textModel,
        contents: prompt,
        config: {
          systemInstruction,
        },
      }),
    );

    return {
      contentMarkdown: (response.text ?? '').trim(),
      modelUsed: cfg.textModel,
    };
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    const cfg = getServerConfig();
    const ai = getGeminiClient();

    const embeddings: number[][] = [];
    // Batch up to 16 texts per call
    for (let i = 0; i < texts.length; i += 16) {
      const batch = texts.slice(i, i + 16);
      const res = await withRetry(() =>
        ai.models.embedContent({
          model: cfg.embeddingModel,
          contents: batch,
        }),
      );
      for (const emb of res.embeddings ?? []) {
        embeddings.push(emb.values ?? []);
      }
    }
    return embeddings;
  }

  async tutorChat(input: TutorChatInput): Promise<{ answer: string; citationsSummary: string; modelUsed: string }> {
    const cfg = getServerConfig();
    const ai = getGeminiClient();

    const modeGuidance: Record<TutorChatInput['teachingMode'], string> = {
      beginner: 'Use clear everyday analogies, define foundational terms first, and check understanding step by step.',
      intermediate: 'Assume core undergraduate familiarity; focus on connecting concepts, worked steps, and structured reasoning.',
      advanced: 'Use rigorous university-level terminology, proofs/derivations, and critical analysis.',
      exam: 'Coach at Kenyan university examination standard: focus on marking-scheme clarity, structured arguments, edge cases, and follow-up practice questions.',
    };

    const chunkBlock =
      input.retrievedChunks.length > 0
        ? input.retrievedChunks
            .map((c, idx) => `[Excerpt ${idx + 1} — ${c.materialTitle} (${c.sectionLabel})]\n${c.text}`)
            .join('\n\n')
        : 'No uploaded document excerpts were retrieved for this question.';

    const systemInstruction = `You are a university-level AI Academic Tutor primarily supporting students in Kenya.
Teaching Mode: ${input.teachingMode.toUpperCase()} — ${modeGuidance[input.teachingMode]}
${input.unitCode ? `Active Unit Context: ${input.unitCode}` : ''}

Academic Grounding Rules:
1. Distinguish clearly between:
   - **From Your Uploaded Materials**: cite exact excerpts like [Excerpt 1] when using retrieved content. Never fabricate page numbers or citations.
   - **General Academic Knowledge**: label any standard academic explanation outside the uploaded excerpts.
   - **Not Verified in Materials**: explicitly tell the student when a specific claim is not in their uploaded files.
2. Pedagogical Approach: Explain concepts rather than simply handing over bare answers. For complex problems:
   - Break down what the question asks
   - Identify key concepts/formulas
   - Show step-by-step reasoning
   - Give the final conclusion
   - Offer 1 short similar practice question for independent study.`;

    const conversationText = [
      'RETRIEVED STUDY MATERIAL EXCERPTS:',
      chunkBlock,
      '',
      'CONVERSATION HISTORY:',
      ...input.history.slice(-8).map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.content}`),
      '',
      `Student Question: ${input.question}`,
    ].join('\n');

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: cfg.textModel,
        contents: conversationText,
        config: {
          systemInstruction,
        },
      }),
    );

    const citationsSummary =
      input.retrievedChunks.length > 0
        ? input.retrievedChunks.map((c, idx) => `[Excerpt ${idx + 1}] ${c.materialTitle} (${c.sectionLabel})`).join(' | ')
        : 'General Academic Knowledge (no document attached)';

    return {
      answer: (response.text ?? '').trim(),
      citationsSummary,
      modelUsed: cfg.textModel,
    };
  }

  async generateQuiz(input: {
    sourceText: string;
    unitCode?: string;
    topic?: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced' | 'exam';
    questionCount: number;
    mode: 'quiz' | 'mock_exam';
  }): Promise<{ questions: QuizQuestionItem[]; modelUsed: string }> {
    const cfg = getServerConfig();
    const ai = getGeminiClient();

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: cfg.textModel,
        contents: `Generate ${input.questionCount} university revision questions (${input.mode === 'mock_exam' ? 'Mixed Mock Examination' : 'Practice Quiz'}) at "${input.difficulty}" difficulty.
Unit: ${input.unitCode || 'General'} | Topic: ${input.topic || 'Core Lecture Material'}
Include a balanced mix of "mcq" (4 options), "true_false" (options ["True", "False"]), "short_answer", and "structured" questions.
Do NOT claim these questions predict an actual upcoming university exam paper.

SOURCE STUDY CONTENT:
${input.sourceText.slice(0, 60000)}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                type: { type: Type.STRING, description: 'One of: mcq, true_false, short_answer, structured' },
                question: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                marks: { type: Type.INTEGER },
              },
              required: ['id', 'type', 'question', 'correctAnswer', 'explanation', 'marks'],
            },
          },
        },
      }),
    );

    const parsed = JSON.parse((response.text ?? '[]').trim() || '[]');
    return {
      questions: Array.isArray(parsed) ? parsed : [],
      modelUsed: cfg.textModel,
    };
  }

  async gradeSubjectiveAnswers(
    items: Array<{ id: string; question: string; expectedAnswer: string; studentAnswer: string; maxMarks: number }>,
  ): Promise<Array<{ id: string; awardedMarks: number; feedback: string }>> {
    if (!items.length) return [];
    const cfg = getServerConfig();
    const ai = getGeminiClient();

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: cfg.textModel,
        contents: `Evaluate these university student answers fairly against the expected reference answers.
Note clearly if an answer is partially correct or if grading depends on lecturer rubric nuances (uncertainty).
Submissions:
${JSON.stringify(items, null, 2)}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                awardedMarks: { type: Type.NUMBER },
                feedback: { type: Type.STRING },
              },
              required: ['id', 'awardedMarks', 'feedback'],
            },
          },
        },
      }),
    );

    const parsed = JSON.parse((response.text ?? '[]').trim() || '[]');
    return Array.isArray(parsed) ? parsed : [];
  }

  async generateFlashcards(input: {
    sourceText: string;
    topic?: string;
    count: number;
  }): Promise<{ flashcards: FlashcardItem[]; modelUsed: string }> {
    const cfg = getServerConfig();
    const ai = getGeminiClient();

    const response = await withRetry(() =>
      ai.models.generateContent({
        model: cfg.textModel,
        contents: `Create ${input.count} active-recall university study flashcards from the material below.
Topic: ${input.topic || 'Key Concepts'}
Each card must have a clear focused question/prompt on "front" and a concise, accurate explanation/definition on "back".

MATERIAL:
${input.sourceText.slice(0, 60000)}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                front: { type: Type.STRING },
                back: { type: Type.STRING },
                topic: { type: Type.STRING },
              },
              required: ['front', 'back', 'topic'],
            },
          },
        },
      }),
    );

    const parsed = JSON.parse((response.text ?? '[]').trim() || '[]');
    return {
      flashcards: Array.isArray(parsed) ? parsed : [],
      modelUsed: cfg.textModel,
    };
  }
}

export const aiProvider = new GeminiAcademicProvider();
