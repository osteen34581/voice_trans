import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Save,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import { apiJson } from '../../lib/api';
import { db, handleFirestoreError, makeDocId, OperationType } from '../../lib/firebase';
import {
  clearDraftRecording,
  loadDraftRecording,
  saveDraftRecording,
} from '../../lib/indexedDbAudio';
import type { AppTab, StudentUnit } from '../../types/academic';

interface RecordLectureViewProps {
  units: StudentUnit[];
  onLectureSaved: (lectureId: string) => void;
  onNavigate: (tab: AppTab) => void;
}

type RecStatus = 'idle' | 'requesting' | 'recording' | 'paused' | 'stopped';

const ACCEPTED_AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.webm', '.ogg', '.mp4'];

function formatTimer(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function RecordLectureView({
  units,
  onLectureSaved,
  onNavigate,
}: RecordLectureViewProps) {
  const { user, profile } = useAuth();
  const { notify } = useToast();

  const [mode, setMode] = useState<'record' | 'upload'>('record');
  const [status, setStatus] = useState<RecStatus>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [recoveredDraftAvailable, setRecoveredDraftAvailable] = useState(false);

  // Lecture Metadata
  const [title, setTitle] = useState('');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [manualUnitCode, setManualUnitCode] = useState('');
  const [lecturerName, setLecturerName] = useState('');
  const [lectureDate, setLectureDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [saving, setSaving] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Check IndexedDB for interrupted recording recovery
  useEffect(() => {
    loadDraftRecording().then((draft) => {
      if (draft && draft.chunks.length > 0) {
        setRecoveredDraftAvailable(true);
      }
    });
    return () => {
      cleanupMedia();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const cleanupMedia = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  const drawWaveform = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      analyser.getByteTimeDomainData(dataArray);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#047857';
      ctx.beginPath();
      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      animFrameRef.current = requestAnimationFrame(render);
    };
    render();
  };

  const handleRestoreDraft = async () => {
    const draft = await loadDraftRecording();
    if (!draft || !draft.chunks.length) return;
    const blob = new Blob(draft.chunks, { type: draft.mimeType || 'audio/webm' });
    setAudioBlob(blob);
    setAudioUrl(URL.createObjectURL(blob));
    setDurationSeconds(draft.durationSeconds || 0);
    if (draft.title && !title) setTitle(draft.title);
    setStatus('stopped');
    setRecoveredDraftAvailable(false);
    notify('Recovered unfinished recording', 'Preview and save your audio below.', 'success');
  };

  const handleDiscardDraft = async () => {
    await clearDraftRecording();
    setRecoveredDraftAvailable(false);
  };

  const startRecording = async () => {
    setMicError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setMicError('This browser does not support MediaRecorder audio capture. Please use Chrome, Firefox, Edge, or upload an audio file.');
      return;
    }

    setStatus('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup live waveform analyser
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      analyserRef.current = analyser;

      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setDurationSeconds(0);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
          saveDraftRecording({
            id: 'active_draft',
            title: title || 'Recovered Lecture',
            mimeType: recorder.mimeType || 'audio/webm',
            chunks: chunksRef.current,
            durationSeconds,
            updatedAt: Date.now(),
          });
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setStatus('stopped');
        cleanupMedia();
      };

      // Handle unexpected microphone disconnect / interruption
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
            setMicError('Microphone connection was interrupted. Your captured audio up to that moment has been preserved.');
          }
        };
      });

      recorder.start(4000);
      setStatus('recording');
      drawWaveform();

      timerRef.current = window.setInterval(() => {
        setDurationSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setStatus('idle');
      const msg = err instanceof Error ? err.message : 'Microphone permission denied.';
      setMicError(
        msg.toLowerCase().includes('denied') || msg.toLowerCase().includes('notallowed')
          ? 'Microphone permission was denied. Enable microphone access in your browser site settings or switch to Upload Audio.'
          : `Could not access microphone: ${msg}`,
      );
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      if (timerRef.current) window.clearInterval(timerRef.current);
      setStatus('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      timerRef.current = window.setInterval(() => {
        setDurationSeconds((s) => s + 1);
      }, 1000);
      setStatus('recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const resetRecording = async () => {
    cleanupMedia();
    chunksRef.current = [];
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setDurationSeconds(0);
    setStatus('idle');
    await clearDraftRecording();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMicError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const lower = file.name.toLowerCase();
    const validExt = ACCEPTED_AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (!validExt && !file.type.startsWith('audio/')) {
      setMicError('Unsupported file format. Please upload MP3, WAV, M4A, WebM, or OGG audio.');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setMicError('Audio file exceeds the 50 MB maximum upload size.');
      return;
    }
    setUploadedFile(file);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    if (!title) {
      setTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSaveLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const activeAudio = mode === 'record' ? audioBlob : uploadedFile;
    if (!activeAudio) {
      notify('Audio required', 'Record a lecture or select an audio file before saving.', 'error');
      return;
    }
    if (!title.trim() || title.trim().length < 2) {
      notify('Title required', 'Enter a lecture title (at least 2 characters).', 'error');
      return;
    }

    setSaving(true);
    const lectureId = makeDocId('lec');
    const chosenUnit = units.find((u) => u.id === selectedUnitId);
    const unitCode = chosenUnit?.unitCode || manualUnitCode.trim() || '';
    const unitName = chosenUnit?.unitName || '';

    try {
      // 1. Upload audio privately to authenticated Express endpoint
      const fileName =
        mode === 'upload' && uploadedFile
          ? uploadedFile.name
          : `${title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webm`;
      const form = new FormData();
      form.append('lectureId', lectureId);
      form.append('audio', activeAudio, fileName);

      const uploadMeta = await apiJson<{
        audioFileName: string;
        audioMimeType: string;
        audioSizeBytes: number;
      }>('/api/audio/upload', {
        method: 'POST',
        body: form,
      });

      // 2. Create lecture metadata in Firestore
      const safeFileName = (uploadMeta?.audioFileName || fileName || 'lecture-audio.webm').slice(0, 200);
      const safeMimeType = (uploadMeta?.audioMimeType || activeAudio.type || 'audio/webm').slice(0, 80);
      const safeSizeBytes =
        typeof uploadMeta?.audioSizeBytes === 'number' ? uploadMeta.audioSizeBytes : activeAudio.size || 0;

      try {
        await setDoc(doc(db, 'lectures', lectureId), {
          userId: user.uid,
          unitId: (chosenUnit?.id || '').slice(0, 128),
          unitCode: unitCode.slice(0, 32),
          unitName: unitName.slice(0, 160),
          university: (chosenUnit?.university || profile?.university || '').slice(0, 160),
          course: (chosenUnit?.course || profile?.course || '').slice(0, 160),
          title: title.trim().slice(0, 200),
          lecturerName: lecturerName.trim().slice(0, 120),
          lectureDate: (lectureDate || new Date().toISOString().slice(0, 10)).slice(0, 32),
          description: description.trim().slice(0, 1000),
          audioFileName: safeFileName,
          audioMimeType: safeMimeType,
          audioSizeBytes: safeSizeBytes,
          durationSeconds: durationSeconds || 0,
          transcriptionStatus: autoTranscribe ? 'processing' : 'uploaded',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (fsErr) {
        handleFirestoreError(fsErr, OperationType.CREATE, `lectures/${lectureId}`);
      }

      await clearDraftRecording();
      notify('Lecture saved securely', 'Audio stored privately in your account.', 'success');

      // 3. Optionally kick off background transcription right away
      if (autoTranscribe) {
        apiJson<{
          rawText: string;
          languageDetected: string;
          uncertaintyNotes: string;
          modelUsed: string;
        }>('/api/ai/transcribe', {
          method: 'POST',
          body: JSON.stringify({
            lectureId,
            lectureTitle: title.trim(),
            unitCode,
          }),
        })
          .then(async (tx) => {
            const transcriptId = makeDocId('tx');
            const rawText = (tx.rawText || '').slice(0, 180000);
            await setDoc(doc(db, 'transcripts', transcriptId), {
              userId: user.uid,
              lectureId,
              rawText,
              editedText: rawText,
              languageDetected: (tx.languageDetected || 'en').slice(0, 64),
              uncertaintyNotes: (tx.uncertaintyNotes || '').slice(0, 4000),
              modelUsed: (tx.modelUsed || 'gemini-3.5-transcribe').slice(0, 80),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(doc(db, 'lectures', lectureId), {
              transcriptionStatus: 'completed',
              updatedAt: serverTimestamp(),
            });
            await setDoc(doc(db, 'notifications', makeDocId('notif')), {
              userId: user.uid,
              type: 'transcription',
              title: 'Transcription completed',
              message: `"${title.trim()}" is ready to review and convert into study notes.`,
              read: false,
              linkTab: 'lectures',
              createdAt: serverTimestamp(),
            });
            notify('Transcription completed', `"${title.trim()}" is ready.`, 'success');
          })
          .catch(async (err) => {
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(doc(db, 'lectures', lectureId), {
              transcriptionStatus: 'failed',
              transcriptionError: err instanceof Error ? err.message : 'Transcription failed',
              updatedAt: serverTimestamp(),
            }).catch(() => {});
            notify(
              'Transcription failed',
              err instanceof Error ? err.message : 'You can retry from My Lectures.',
              'error',
            );
          });
      }

      onLectureSaved(lectureId);
      onNavigate('lectures');
    } catch (err) {
      notify(
        'Failed to save lecture',
        err instanceof Error ? err.message : 'Check your audio file and try again.',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Recovery Banner */}
      {recoveredDraftAvailable && (
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <strong>Unfinished recording recovered:</strong> An unsaved lecture capture was preserved locally before your last refresh.
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-700 text-white hover:bg-amber-800 cursor-pointer"
            >
              Restore Audio
            </button>
            <button
              type="button"
              onClick={handleDiscardDraft}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 dark:border-amber-700 cursor-pointer"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Mode Switcher */}
      <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setMode('record')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            mode === 'record'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          Live Microphone Recording
        </button>
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            mode === 'upload'
              ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Upload className="w-3.5 h-3.5" />
          Upload Recorded Audio
        </button>
      </div>

      {/* Capture / Upload Panel */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
        {micError && (
          <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{micError}</span>
          </div>
        )}

        {mode === 'record' ? (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold">Lecture Recording Studio</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Status: <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">{status}</span>
                  {' · '}
                  Local crash-recovery active
                </p>
              </div>
              <div className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-slate-900 dark:text-white">
                {formatTimer(durationSeconds)}
              </div>
            </div>

            <div className="h-24 w-full rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 overflow-hidden flex items-center justify-center">
              <canvas ref={canvasRef} width={760} height={96} className="w-full h-full" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {status === 'idle' || status === 'requesting' ? (
                <button
                  type="button"
                  disabled={status === 'requesting'}
                  onClick={startRecording}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 transition-colors cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  {status === 'requesting' ? 'Requesting Microphone...' : 'Start Recording'}
                </button>
              ) : null}

              {status === 'recording' && (
                <>
                  <button
                    type="button"
                    onClick={pauseRecording}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                  >
                    <Square className="w-4 h-4" />
                    Stop Recording
                  </button>
                </>
              )}

              {status === 'paused' && (
                <>
                  <button
                    type="button"
                    onClick={resumeRecording}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                  >
                    <Square className="w-4 h-4" />
                    Stop Recording
                  </button>
                </>
              )}

              {status === 'stopped' && (
                <button
                  type="button"
                  onClick={resetRecording}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Record Again
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="font-display text-lg font-bold">Upload Lecture Audio File</h2>
            <label className="block border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-8 text-center hover:border-emerald-600 transition-colors cursor-pointer">
              <Upload className="w-6 h-6 mx-auto text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {uploadedFile ? uploadedFile.name : 'Click to select MP3, WAV, M4A, WebM, or OGG audio'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Maximum 50 MB · Stored privately for your account only
              </p>
              <input
                type="file"
                accept=".mp3,.wav,.m4a,.webm,.ogg,audio/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {uploadedFile && (
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <span className="font-mono tabular-nums">
                  {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB · {uploadedFile.type || 'audio'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setUploadedFile(null);
                    setAudioUrl(null);
                  }}
                  className="inline-flex items-center gap-1 text-red-600 hover:underline cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remove file
                </button>
              </div>
            )}
          </div>
        )}

        {/* Playback Verification */}
        {audioUrl && (
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Audio ready for playback verification and saving</span>
            </div>
            <audio controls src={audioUrl} className="w-full" />
          </div>
        )}

        {/* Honest Capability & Consent Disclosure */}
        <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
          <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <p>
            <strong>Recording Notice:</strong> Keep this browser tab active while recording. Browser PWAs cannot guarantee locked-screen or background capture, and automatic capture of Zoom/Google Meet/Teams calls is not enabled in this release. Obtain lecturer consent before recording.
          </p>
        </div>
      </div>

      {/* Lecture Metadata Form */}
      <form
        onSubmit={handleSaveLecture}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
      >
        <h3 className="font-display text-base font-semibold">Lecture Metadata &amp; Save</h3>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Lecture Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Week 4 — Separation of Powers in Kenya"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Academic Unit</label>
            {units.length > 0 ? (
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              >
                <option value="">Select enrolled unit (optional)</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unitCode} — {u.unitName}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={manualUnitCode}
                onChange={(e) => setManualUnitCode(e.target.value)}
                placeholder="e.g. ICS 3102 / GPR 201"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
              />
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Lecturer Name (Optional)</label>
            <input
              type="text"
              value={lecturerName}
              onChange={(e) => setLecturerName(e.target.value)}
              placeholder="e.g. Dr. Mutua"
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Lecture Date</label>
            <input
              type="date"
              value={lectureDate}
              onChange={(e) => setLectureDate(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Additional Description (Optional)</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Key topics covered, textbook chapter, or assignment reminders"
            className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
        </div>

        <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoTranscribe}
            onChange={(e) => setAutoTranscribe(e.target.checked)}
            className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
          />
          <span>Automatically transcribe this recording using speech-to-text after saving</span>
        </label>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving || (!audioBlob && !uploadedFile)}
            className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving Recording...' : 'Save Lecture Recording'}
          </button>
        </div>
      </form>
    </div>
  );
}
