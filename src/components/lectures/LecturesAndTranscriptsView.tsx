import React, { useEffect, useState } from 'react';
import {
  Copy,
  Edit3,
  FileEdit,
  FileText,
  Play,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import { apiJson, fetchAuthorizedAudioUrl } from '../../lib/api';
import { db, formatFirestoreDate, handleFirestoreError, makeDocId, OperationType } from '../../lib/firebase';
import { markdownToSimpleHtml } from '../../lib/exporters';
import { NOTE_FORMATS } from '../../config/branding';
import type {
  AppTab,
  GeneratedNote,
  Lecture,
  Transcript,
} from '../../types/academic';

interface LecturesAndTranscriptsViewProps {
  initialTabMode: 'lectures' | 'notes';
  lectures: Lecture[];
  transcripts: Transcript[];
  notes: GeneratedNote[];
  selectedLectureId: string | null;
  onSelectLecture: (id: string | null) => void;
  onOpenDocument: (docId: string) => void;
  onNavigate: (tab: AppTab) => void;
}

export function LecturesAndTranscriptsView({
  initialTabMode,
  lectures,
  transcripts,
  notes,
  selectedLectureId,
  onSelectLecture,
  onOpenDocument,
  onNavigate,
}: LecturesAndTranscriptsViewProps) {
  const { user, profile } = useAuth();
  const { notify, confirm } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [audioPlayUrl, setAudioPlayUrl] = useState<string | null>(null);
  const [loadingAudio, setLoadingAudio] = useState(false);

  // Rename lecture
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');

  // Transcript editing (never mutates rawText)
  const [editedTextDraft, setEditedTextDraft] = useState('');
  const [viewRawTranscript, setViewRawTranscript] = useState(false);
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [transcribingId, setTranscribingId] = useState<string | null>(null);

  // AI Notes generation
  const [noteFormat, setNoteFormat] = useState('detailed_notes');
  const [summaryLength, setSummaryLength] = useState<'brief' | 'standard' | 'detailed'>('standard');
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);

  const activeLecture =
    lectures.find((l) => l.id === selectedLectureId) || lectures[0] || null;
  const activeTranscript = activeLecture
    ? transcripts.find((t) => t.lectureId === activeLecture.id) || null
    : null;
  const lectureNotes = activeLecture
    ? notes.filter((n) => n.lectureId === activeLecture.id)
    : notes;
  const activeNote =
    lectureNotes.find((n) => n.id === activeNoteId) || lectureNotes[0] || null;

  useEffect(() => {
    if (activeTranscript) {
      setEditedTextDraft(activeTranscript.editedText || activeTranscript.rawText);
    } else {
      setEditedTextDraft('');
    }
  }, [activeTranscript?.id]);

  useEffect(() => {
    return () => {
      if (audioPlayUrl) URL.revokeObjectURL(audioPlayUrl);
    };
  }, [audioPlayUrl]);

  const handleLoadAudio = async (lectureId: string) => {
    setLoadingAudio(true);
    try {
      if (audioPlayUrl) URL.revokeObjectURL(audioPlayUrl);
      const url = await fetchAuthorizedAudioUrl(lectureId);
      setAudioPlayUrl(url);
    } catch (err) {
      notify(
        'Audio unavailable',
        err instanceof Error ? err.message : 'Private audio file could not be loaded.',
        'error',
      );
    } finally {
      setLoadingAudio(false);
    }
  };

  const handleTranscribe = async (lec: Lecture) => {
    if (!user) return;
    setTranscribingId(lec.id);
    try {
      await updateDoc(doc(db, 'lectures', lec.id), {
        transcriptionStatus: 'processing',
        updatedAt: serverTimestamp(),
      });

      const tx = await apiJson<{
        rawText: string;
        languageDetected: string;
        uncertaintyNotes: string;
        modelUsed: string;
      }>('/api/ai/transcribe', {
        method: 'POST',
        body: JSON.stringify({
          lectureId: lec.id,
          lectureTitle: lec.title,
          unitCode: lec.unitCode,
        }),
      });

      const txId = makeDocId('tx');
      const rawText = (tx.rawText || '').slice(0, 180000);
      await setDoc(doc(db, 'transcripts', txId), {
        userId: user.uid,
        lectureId: lec.id,
        rawText,
        editedText: rawText,
        languageDetected: (tx.languageDetected || 'en').slice(0, 64),
        uncertaintyNotes: (tx.uncertaintyNotes || '').slice(0, 4000),
        modelUsed: (tx.modelUsed || 'gemini-3.5-transcribe').slice(0, 80),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await updateDoc(doc(db, 'lectures', lec.id), {
        transcriptionStatus: 'completed',
        updatedAt: serverTimestamp(),
      });

      notify('Transcription completed', `"${lec.title}" has been transcribed.`, 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transcription failed.';
      await updateDoc(doc(db, 'lectures', lec.id), {
        transcriptionStatus: 'failed',
        transcriptionError: msg.slice(0, 500),
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      notify('Transcription failed', msg, 'error');
    } finally {
      setTranscribingId(null);
    }
  };

  const handleSaveEditedTranscript = async () => {
    if (!activeTranscript) return;
    setSavingTranscript(true);
    try {
      await updateDoc(doc(db, 'transcripts', activeTranscript.id), {
        editedText: editedTextDraft.slice(0, 180000),
        updatedAt: serverTimestamp(),
      });
      notify('Transcript edits saved', 'Original transcript remains preserved separately.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `transcripts/${activeTranscript.id}`);
    } finally {
      setSavingTranscript(false);
    }
  };

  const handleGenerateNotes = async () => {
    if (!user || !activeLecture || !activeTranscript) {
      notify('Transcript required', 'Transcribe the lecture before generating AI notes.', 'error');
      return;
    }

    setGeneratingNotes(true);
    try {
      const res = await apiJson<{ contentMarkdown: string; modelUsed: string }>(
        '/api/ai/generate-notes',
        {
          method: 'POST',
          body: JSON.stringify({
            transcript: activeTranscript.editedText || activeTranscript.rawText,
            title: activeLecture.title,
            unitCode: activeLecture.unitCode,
            unitName: activeLecture.unitName,
            format: noteFormat,
            summaryLength,
          }),
        },
      );

      const noteId = makeDocId('note');
      const nextVersion = lectureNotes.length + 1;
      const formatLabel = NOTE_FORMATS.find((f) => f.id === noteFormat)?.label || noteFormat;

      await setDoc(doc(db, 'generatedNotes', noteId), {
        userId: user.uid,
        lectureId: activeLecture.id,
        unitCode: (activeLecture.unitCode || '').slice(0, 32),
        unitName: (activeLecture.unitName || '').slice(0, 160),
        title: `${activeLecture.title} — ${formatLabel}`.slice(0, 200),
        format: formatLabel.slice(0, 60),
        summaryLength,
        contentMarkdown: (res.contentMarkdown || '').slice(0, 180000),
        versionNumber: nextVersion,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await setDoc(doc(db, 'notifications', makeDocId('notif')), {
        userId: user.uid,
        type: 'notes',
        title: 'AI lecture notes generated',
        message: `Version ${nextVersion} (${summaryLength}) for "${activeLecture.title.slice(0, 120)}" is ready.`.slice(0, 500),
        read: false,
        linkTab: 'notes',
        createdAt: serverTimestamp(),
      });

      setActiveNoteId(noteId);
      notify('Notes generated', `Saved as Version ${nextVersion} without overwriting earlier notes.`, 'success');
    } catch (err) {
      notify(
        'Could not generate notes',
        err instanceof Error ? err.message : 'Please try again.',
        'error',
      );
    } finally {
      setGeneratingNotes(false);
    }
  };

  const handleOpenInDocumentEditor = async (note: GeneratedNote) => {
    if (!user) return;
    const docId = makeDocId('doc');
    const htmlContent = markdownToSimpleHtml(note.contentMarkdown);
    try {
      await setDoc(doc(db, 'documents', docId), {
        userId: user.uid,
        lectureId: note.lectureId,
        title: (note.title || 'Study Notes').slice(0, 200),
        university: (activeLecture?.university || profile?.university || '').slice(0, 160),
        course: (activeLecture?.course || profile?.course || '').slice(0, 160),
        unitCode: (note.unitCode || activeLecture?.unitCode || '').slice(0, 32),
        unitName: (note.unitName || activeLecture?.unitName || '').slice(0, 160),
        lecturerName: (activeLecture?.lecturerName || '').slice(0, 120),
        lectureDate: (activeLecture?.lectureDate || '').slice(0, 32),
        htmlContent: htmlContent.slice(0, 250000),
        plainText: (note.contentMarkdown || '').slice(0, 180000),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onOpenDocument(docId);
      onNavigate('documents');
      notify('Opened in Document Editor', 'You can now edit and export to Word or PDF.', 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `documents/${docId}`);
    }
  };

  const handleRenameLecture = async (lec: Lecture) => {
    const cleaned = renameTitle.trim().slice(0, 200);
    if (cleaned.length < 2) {
      notify('Title too short', 'Lecture title must be at least 2 characters.', 'error');
      return;
    }
    try {
      await updateDoc(doc(db, 'lectures', lec.id), {
        title: cleaned,
        updatedAt: serverTimestamp(),
      });
      setRenamingId(null);
      notify('Lecture renamed', undefined, 'success');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `lectures/${lec.id}`);
    }
  };

  const handleDeleteLecture = async (lec: Lecture) => {
    const ok = await confirm({
      title: 'Delete lecture recording?',
      message: `This permanently removes "${lec.title}" and its private audio file from your account.`,
      confirmLabel: 'Delete Lecture',
      destructive: true,
    });
    if (!ok) return;

    try {
      await apiJson(`/api/audio/${encodeURIComponent(lec.id)}`, { method: 'DELETE' }).catch(() => {});
      await deleteDoc(doc(db, 'lectures', lec.id));
      if (selectedLectureId === lec.id) onSelectLecture(null);
      notify('Lecture deleted', undefined, 'info');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `lectures/${lec.id}`);
    }
  };

  const filteredLectures = lectures.filter(
    (l) =>
      l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (l.unitCode || '').toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const displayedTranscriptText = viewRawTranscript
    ? activeTranscript?.rawText || ''
    : editedTextDraft;

  const filteredTranscriptMatches =
    transcriptSearch.trim() && displayedTranscriptText
      ? displayedTranscriptText
          .split('\n')
          .filter((p) => p.toLowerCase().includes(transcriptSearch.toLowerCase())).length
      : null;

  if (initialTabMode === 'notes' && notes.length === 0 && !activeLecture) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
        <FileText className="w-8 h-8 mx-auto text-slate-400" />
        <h2 className="font-display text-lg font-bold">No AI Lecture Notes Yet</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Record or upload a lecture, transcribe it, and generate structured summaries, definitions, and revision points.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('record')}
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
        >
          Record a Lecture
        </button>
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      {/* Left Sidebar: Lectures List */}
      <div className="lg:col-span-4 space-y-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-bold">Lectures ({lectures.length})</h2>
            <button
              type="button"
              onClick={() => onNavigate('record')}
              className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              + New Recording
            </button>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search title or unit code..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
            />
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[600px] overflow-y-auto">
            {filteredLectures.length === 0 ? (
              <p className="py-6 text-xs text-slate-500 dark:text-slate-400 text-center">
                No lectures match your search.
              </p>
            ) : (
              filteredLectures.map((lec) => {
                const isSelected = activeLecture?.id === lec.id;
                return (
                  <div
                    key={lec.id}
                    className={`py-3 px-2 rounded-lg transition-colors ${
                      isSelected ? 'bg-emerald-50/70 dark:bg-emerald-950/30' : ''
                    }`}
                  >
                    {renamingId === lec.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={renameTitle}
                          onChange={(e) => setRenameTitle(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        <button
                          type="button"
                          onClick={() => handleRenameLecture(lec)}
                          className="text-xs font-semibold text-emerald-700 cursor-pointer"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onSelectLecture(lec.id);
                          setAudioPlayUrl(null);
                        }}
                        className="w-full text-left cursor-pointer"
                      >
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {lec.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {[lec.unitCode || 'General', lec.lectureDate || formatFirestoreDate(lec.createdAt), lec.transcriptionStatus]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </button>
                    )}

                    <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingId(lec.id);
                          setRenameTitle(lec.title);
                        }}
                        className="hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" /> Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteLecture(lec)}
                        className="hover:text-red-600 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Right Column: Transcript & AI Notes Workspace */}
      <div className="lg:col-span-8 space-y-6">
        {!activeLecture ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center text-sm text-slate-500">
            Select a lecture from the list to inspect audio, transcripts, and AI study notes.
          </div>
        ) : (
          <>
            {/* Lecture Header & Private Audio Player */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                    {activeLecture.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {[
                      activeLecture.unitCode,
                      activeLecture.unitName,
                      activeLecture.lecturerName ? `Lecturer: ${activeLecture.lecturerName}` : null,
                      activeLecture.lectureDate,
                      `Status: ${activeLecture.transcriptionStatus}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={loadingAudio}
                    onClick={() => handleLoadAudio(activeLecture.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {loadingAudio ? 'Loading Audio...' : 'Play Recording'}
                  </button>

                  <button
                    type="button"
                    disabled={transcribingId === activeLecture.id}
                    onClick={() => handleTranscribe(activeLecture)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${transcribingId === activeLecture.id ? 'animate-spin' : ''}`} />
                    {transcribingId === activeLecture.id
                      ? 'Transcribing...'
                      : activeLecture.transcriptionStatus === 'failed'
                        ? 'Retry Transcription'
                        : activeTranscript
                          ? 'Re-Transcribe Audio'
                          : 'Transcribe Audio'}
                  </button>
                </div>
              </div>

              {activeLecture.transcriptionError && activeLecture.transcriptionStatus === 'failed' && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  Last error: {activeLecture.transcriptionError}
                </p>
              )}

              {audioPlayUrl && <audio controls src={audioPlayUrl} className="w-full" />}
            </div>

            {/* Transcript Viewer & Editor */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold">Lecture Transcript</h3>
                  {activeTranscript && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Model: {activeTranscript.modelUsed}
                      {activeTranscript.languageDetected ? ` · ${activeTranscript.languageDetected}` : ''}
                    </p>
                  )}
                </div>

                {activeTranscript && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                      <button
                        type="button"
                        onClick={() => setViewRawTranscript(false)}
                        className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                          !viewRawTranscript ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
                        }`}
                      >
                        Editable Copy
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewRawTranscript(true)}
                        className={`px-3 py-1 rounded-md font-medium cursor-pointer ${
                          viewRawTranscript ? 'bg-white dark:bg-slate-900 shadow-xs' : 'text-slate-500'
                        }`}
                      >
                        Original Verbatim
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(displayedTranscriptText);
                        notify('Copied transcript', undefined, 'info');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </button>
                  </div>
                )}
              </div>

              {!activeTranscript ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
                  Click <strong>Transcribe Audio</strong> above to generate a speech-to-text transcript from this recording.
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={transcriptSearch}
                        onChange={(e) => setTranscriptSearch(e.target.value)}
                        placeholder="Search within transcript..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                      />
                    </div>
                    {filteredTranscriptMatches !== null && (
                      <span className="text-xs font-mono text-slate-500 tabular-nums">
                        {filteredTranscriptMatches} paragraph(s) match
                      </span>
                    )}
                  </div>

                  {activeTranscript.uncertaintyNotes && (
                    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                      <strong>Speech Uncertainty Note:</strong> {activeTranscript.uncertaintyNotes}
                    </div>
                  )}

                  {viewRawTranscript ? (
                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                      {activeTranscript.rawText}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        rows={10}
                        value={editedTextDraft}
                        onChange={(e) => setEditedTextDraft(e.target.value)}
                        className="w-full p-4 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 leading-relaxed"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={savingTranscript}
                          onClick={handleSaveEditedTranscript}
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
                        >
                          <Save className="w-3.5 h-3.5" />
                          {savingTranscript ? 'Saving...' : 'Save Transcript Edits'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* AI Lecture Notes Generator & Versions */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-base font-semibold">AI Lecture Notes Generator</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Generates structured notes while preserving previous versions.
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 items-end">
                <div>
                  <label className="block text-xs font-medium mb-1">Note Format</label>
                  <select
                    value={noteFormat}
                    onChange={(e) => setNoteFormat(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    {NOTE_FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">Summary Depth</label>
                  <select
                    value={summaryLength}
                    onChange={(e) => setSummaryLength(e.target.value as 'brief' | 'standard' | 'detailed')}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                  >
                    <option value="brief">Brief</option>
                    <option value="standard">Standard</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </div>

                <button
                  type="button"
                  disabled={generatingNotes || !activeTranscript}
                  onClick={handleGenerateNotes}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 cursor-pointer h-[34px]"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  {generatingNotes ? 'Generating Notes...' : 'Generate AI Notes'}
                </button>
              </div>

              {lectureNotes.length > 0 && (
                <div className="space-y-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {lectureNotes.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => setActiveNoteId(n.id)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer ${
                            activeNote?.id === n.id
                              ? 'border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                              : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          v{n.versionNumber} · {n.summaryLength}
                        </button>
                      ))}
                    </div>

                    {activeNote && (
                      <button
                        type="button"
                        onClick={() => handleOpenInDocumentEditor(activeNote)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 cursor-pointer"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        Open in Document Editor
                      </button>
                    )}
                  </div>

                  {activeNote && (
                    <div className="p-5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
                      <ReactMarkdown>{activeNote.contentMarkdown}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
