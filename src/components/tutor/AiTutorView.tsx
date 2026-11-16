import React, { useEffect, useState } from 'react';
import {
  Copy,
  FileUp,
  MessageSquare,
  MessageSquarePlus,
  Radio,
  RefreshCw,
  Send,
  Trash2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { LiveVoiceTutorPanel } from './LiveVoiceTutorPanel';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import { apiJson } from '../../lib/api';
import { db, handleFirestoreError, makeDocId, OperationType } from '../../lib/firebase';
import type {
  AiConversation,
  AiMaterial,
  AiMessage,
  DocumentChunk,
  StudentUnit,
} from '../../types/academic';

interface AiTutorViewProps {
  conversations: AiConversation[];
  materials: AiMaterial[];
  units: StudentUnit[];
}

export function AiTutorView({ conversations, materials, units }: AiTutorViewProps) {
  const { user } = useAuth();
  const { notify, confirm } = useToast();

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [tutorMode, setTutorMode] = useState<'chat' | 'voice'>('chat');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);

  const [teachingMode, setTeachingMode] = useState<'beginner' | 'intermediate' | 'advanced' | 'exam'>('intermediate');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [selectedUnitCode, setSelectedUnitCode] = useState<string>('');
  const [questionInput, setQuestionInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploadingMaterial, setUploadingMaterial] = useState(false);

  const activeConv =
    conversations.find((c) => c.id === selectedConvId) || conversations[0] || null;

  useEffect(() => {
    if (activeConv) {
      setTeachingMode(activeConv.teachingMode);
      setSelectedMaterialId(activeConv.materialId || '');
      setSelectedUnitCode(activeConv.unitCode || '');
    }
  }, [activeConv?.id]);

  // Listen to messages in active conversation
  useEffect(() => {
    if (!user || !activeConv) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'aiMessages'),
      where('userId', '==', user.uid),
      where('conversationId', '==', activeConv.id),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiMessage, 'id'>) }));
        rows.sort((a, b) => {
          const tA = (a.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          const tB = (b.createdAt as { seconds?: number } | undefined)?.seconds || 0;
          return tA - tB;
        });
        setMessages(rows);
      },
      (err) => console.warn('Messages snapshot:', err.message),
    );
    return () => unsub();
  }, [user, activeConv?.id]);

  // Listen to chunks for selected material
  useEffect(() => {
    const matId = selectedMaterialId || activeConv?.materialId;
    if (!user || !matId) {
      setChunks([]);
      return;
    }
    const q = query(
      collection(db, 'documentChunks'),
      where('userId', '==', user.uid),
      where('materialId', '==', matId),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setChunks(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<DocumentChunk, 'id'>) })));
      },
      (err) => console.warn('Chunks snapshot:', err.message),
    );
    return () => unsub();
  }, [user, selectedMaterialId, activeConv?.materialId]);

  const handleNewConversation = async () => {
    if (!user) return;
    const id = makeDocId('conv');
    try {
      await setDoc(doc(db, 'aiConversations', id), {
        userId: user.uid,
        title: `Study Session ${conversations.length + 1}`,
        teachingMode,
        materialId: selectedMaterialId,
        unitCode: selectedUnitCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSelectedConvId(id);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `aiConversations/${id}`);
    }
  };

  const ensureConversationId = async (initialTitle: string): Promise<string | null> => {
    if (!user) return null;
    if (activeConv?.id) return activeConv.id;
    const id = makeDocId('conv');
    try {
      await setDoc(doc(db, 'aiConversations', id), {
        userId: user.uid,
        title: (initialTitle || `Voice Session ${conversations.length + 1}`).slice(0, 160),
        teachingMode,
        materialId: selectedMaterialId,
        unitCode: selectedUnitCode,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setSelectedConvId(id);
      return id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `aiConversations/${id}`);
      return null;
    }
  };

  const handleDeleteConversation = async (conv: AiConversation) => {
    const ok = await confirm({
      title: 'Delete conversation?',
      message: `Remove "${conv.title}" from your AI tutor history?`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'aiConversations', conv.id));
      if (selectedConvId === conv.id) setSelectedConvId(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `aiConversations/${conv.id}`);
    }
  };

  const handleUploadMaterial = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingMaterial(true);
    try {
      const form = new FormData();
      form.append('file', file);

      const processed = await apiJson<{
        fileName: string;
        mimeType: string;
        fileSizeBytes: number;
        extractedPreview: string;
        chunks: Array<{ chunkIndex: number; sectionLabel: string; text: string; embedding: number[] }>;
      }>('/api/documents/extract-and-embed', {
        method: 'POST',
        body: form,
      });

      const materialId = makeDocId('mat');
      await setDoc(doc(db, 'aiMaterials', materialId), {
        userId: user.uid,
        title: file.name.replace(/\.[^.]+$/, ''),
        unitCode: selectedUnitCode,
        fileName: processed.fileName,
        mimeType: processed.mimeType,
        fileSizeBytes: processed.fileSizeBytes,
        chunkCount: processed.chunks.length,
        extractedPreview: processed.extractedPreview,
        createdAt: serverTimestamp(),
      });

      // Persist extracted chunks + embeddings
      for (const ch of processed.chunks) {
        await setDoc(doc(db, 'documentChunks', makeDocId('chk')), {
          userId: user.uid,
          materialId,
          chunkIndex: ch.chunkIndex,
          sectionLabel: ch.sectionLabel,
          text: ch.text,
          embedding: ch.embedding,
          createdAt: serverTimestamp(),
        });
      }

      setSelectedMaterialId(materialId);
      if (activeConv) {
        await updateDoc(doc(db, 'aiConversations', activeConv.id), {
          materialId,
          updatedAt: serverTimestamp(),
        });
      }

      notify(
        'Material indexed for RAG tutoring',
        `${processed.chunks.length} sections extracted from ${file.name}.`,
        'success',
      );
    } catch (err) {
      notify(
        'Document upload failed',
        err instanceof Error ? err.message : 'Unsupported file or extraction error.',
        'error',
      );
    } finally {
      setUploadingMaterial(false);
      e.target.value = '';
    }
  };

  const sendPrompt = async (promptText: string) => {
    if (!user || !promptText.trim()) return;
    setSending(true);

    try {
      let convId = activeConv?.id;
      if (!convId) {
        convId = makeDocId('conv');
        await setDoc(doc(db, 'aiConversations', convId), {
          userId: user.uid,
          title: promptText.trim().slice(0, 48),
          teachingMode,
          materialId: selectedMaterialId,
          unitCode: selectedUnitCode,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSelectedConvId(convId);
      } else if (messages.length === 0) {
        await updateDoc(doc(db, 'aiConversations', convId), {
          title: promptText.trim().slice(0, 48),
          teachingMode,
          materialId: selectedMaterialId,
          unitCode: selectedUnitCode,
          updatedAt: serverTimestamp(),
        });
      }

      // Save user message
      await setDoc(doc(db, 'aiMessages', makeDocId('msg')), {
        userId: user.uid,
        conversationId: convId,
        role: 'user',
        content: promptText.trim(),
        createdAt: serverTimestamp(),
      });

      const activeMaterial = materials.find((m) => m.id === (selectedMaterialId || activeConv?.materialId));
      const res = await apiJson<{ answer: string; citationsSummary: string }>('/api/ai/tutor', {
        method: 'POST',
        body: JSON.stringify({
          question: promptText.trim(),
          teachingMode,
          unitCode: selectedUnitCode,
          history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
          chunks: chunks.map((c) => ({
            materialTitle: activeMaterial?.title || 'Uploaded Material',
            sectionLabel: c.sectionLabel || `Section ${c.chunkIndex + 1}`,
            text: c.text,
            embedding: c.embedding,
          })),
        }),
      });

      await setDoc(doc(db, 'aiMessages', makeDocId('msg')), {
        userId: user.uid,
        conversationId: convId,
        role: 'assistant',
        content: res.answer,
        citations: res.citationsSummary,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      notify(
        'AI Tutor error',
        err instanceof Error ? err.message : 'Unable to reach AI Tutor.',
        'error',
      );
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = questionInput;
    setQuestionInput('');
    await sendPrompt(text);
  };

  const handleRegenerateLast = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      await sendPrompt(lastUser.content);
    }
  };

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      {/* Left Sidebar: Threads & Uploaded Study Materials */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-sm font-bold">Tutor Threads</h2>
            <button
              type="button"
              onClick={handleNewConversation}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto">
            {conversations.length === 0 ? (
              <p className="py-4 text-xs text-slate-500 text-center">
                Start a conversation below.
              </p>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`py-2 px-2 rounded-lg flex items-center justify-between gap-2 ${
                    activeConv?.id === c.id ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : ''
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedConvId(c.id)}
                    className="flex-1 text-left min-w-0 cursor-pointer"
                  >
                    <p className="text-xs font-medium truncate">{c.title}</p>
                    <p className="text-[11px] text-slate-500">{c.teachingMode} mode</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConversation(c)}
                    className="p-1 text-slate-400 hover:text-red-600 cursor-pointer"
                    title="Delete thread"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Document Upload for Grounded RAG */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="font-display text-sm font-bold">Uploaded Study Materials (RAG)</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload PDF, DOCX, or TXT lecture handouts to ask grounded questions with source citations.
          </p>

          <label className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-600 text-xs font-semibold cursor-pointer">
            <FileUp className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            <span>{uploadingMaterial ? 'Extracting & Embedding...' : 'Upload PDF / DOCX / TXT'}</span>
            <input
              type="file"
              accept=".pdf,.docx,.txt,.md"
              disabled={uploadingMaterial}
              onChange={handleUploadMaterial}
              className="hidden"
            />
          </label>

          <select
            value={selectedMaterialId}
            onChange={(e) => setSelectedMaterialId(e.target.value)}
            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
          >
            <option value="">General Academic Mode (No Document Attached)</option>
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title} ({m.chunkCount} excerpts)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right Column: Chat & Live Voice Canvas */}
      <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col min-h-[620px] max-h-[78vh]">
        {/* Teaching Mode & Interaction Mode Bar */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 mr-1">
              <button
                type="button"
                onClick={() => setTutorMode('chat')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                  tutorMode === 'chat'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Text Chat
              </button>
              <button
                type="button"
                onClick={() => setTutorMode('voice')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md cursor-pointer ${
                  tutorMode === 'voice'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                <Radio className="w-3.5 h-3.5" />
                Live Voice
              </button>
            </div>

            <span className="text-xs font-medium text-slate-500">Level:</span>
            {(['beginner', 'intermediate', 'advanced', 'exam'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setTeachingMode(m)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize cursor-pointer ${
                  teachingMode === m
                    ? 'bg-emerald-700 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {m === 'exam' ? 'University Exam' : m}
              </button>
            ))}
          </div>

          {units.length > 0 && (
            <select
              value={selectedUnitCode}
              onChange={(e) => setSelectedUnitCode(e.target.value)}
              className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
            >
              <option value="">Any Unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.unitCode}>
                  {u.unitCode}
                </option>
              ))}
            </select>
          )}
        </div>

        {tutorMode === 'voice' ? (
          <LiveVoiceTutorPanel
            conversationId={activeConv?.id || null}
            onEnsureConversation={ensureConversationId}
            teachingMode={teachingMode}
            unitCode={selectedUnitCode}
            activeMaterial={materials.find((m) => m.id === (selectedMaterialId || activeConv?.materialId))}
            chunks={chunks}
          />
        ) : (
        <>
        {/* Messages Stream */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {messages.length === 0 ? (
            <div className="py-12 text-center space-y-3 max-w-lg mx-auto">
              <h3 className="font-display text-lg font-bold">Personal AI Academic Tutor</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Ask for step-by-step explanations, mathematical derivations, Kenyan legal case breakdowns, code walkthroughs, or questions grounded directly in your uploaded PDFs.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-2">
                {[
                  'Explain the core concepts in my uploaded document step by step',
                  'Help me build a 5-day revision schedule for my upcoming CAT',
                  'Walk me through an exam-style problem on this topic',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => sendPrompt(sample)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 hover:border-emerald-600 text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    {sample}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>

                {msg.role === 'assistant' && (
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                    {msg.citations && <span>Sources: {msg.citations}</span>}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(msg.content);
                        notify('Copied tutor response', undefined, 'info');
                      }}
                      className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={handleRegenerateLast}
                      className="inline-flex items-center gap-1 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Regenerate
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
          {sending && (
            <div className="text-xs text-slate-500 animate-pulse">
              Analyzing your materials and preparing a step-by-step explanation...
            </div>
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSubmit}
          className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-end gap-3"
        >
          <textarea
            rows={2}
            value={questionInput}
            onChange={(e) => setQuestionInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (questionInput.trim() && !sending) {
                  const t = questionInput;
                  setQuestionInput('');
                  sendPrompt(t);
                }
              }
            }}
            placeholder="Ask a conceptual question, paste a problem, or query your uploaded document..."
            className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 resize-none"
          />
          <button
            type="submit"
            disabled={sending || !questionInput.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer h-[44px]"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
