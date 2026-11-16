import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Send,
  Volume2,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/ToastContext';
import { base64Pcm24kToFloat32, float32ToPcm16Base64 } from '../../lib/audioPcm';
import { db, logFirestoreError, makeDocId, OperationType } from '../../lib/firebase';
import type { AiMaterial, DocumentChunk } from '../../types/academic';

const VOICE_OPTIONS = [
  { id: 'Zephyr', label: 'Zephyr (Clear & Balanced)' },
  { id: 'Kore', label: 'Kore (Warm & Steady)' },
  { id: 'Puck', label: 'Puck (Crisp & Energetic)' },
  { id: 'Charon', label: 'Charon (Deep & Calm)' },
  { id: 'Fenrir', label: 'Fenrir (Direct & Analytical)' },
] as const;

interface LiveTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface LiveVoiceTutorPanelProps {
  conversationId: string | null;
  onEnsureConversation: (initialTitle: string) => Promise<string | null>;
  teachingMode: 'beginner' | 'intermediate' | 'advanced' | 'exam';
  unitCode: string;
  activeMaterial?: AiMaterial;
  chunks: DocumentChunk[];
}

export function LiveVoiceTutorPanel({
  conversationId,
  onEnsureConversation,
  teachingMode,
  unitCode,
  activeMaterial,
  chunks,
}: LiveVoiceTutorPanelProps) {
  const { user } = useAuth();
  const { notify } = useToast();

  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [voiceName, setVoiceName] = useState<string>('Zephyr');
  const [isMuted, setIsMuted] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turns, setTurns] = useState<LiveTurn[]>([]);
  const [liveUserDraft, setLiveUserDraft] = useState('');
  const [liveAssistantDraft, setLiveAssistantDraft] = useState('');
  const [textCue, setTextCue] = useState('');

  // Refs for WebSocket & audio nodes to avoid stale closures inside audio callbacks
  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isMutedRef = useRef<boolean>(false);
  const activeConvIdRef = useRef<string | null>(conversationId);
  const userDraftRef = useRef<string>('');
  const assistantDraftRef = useRef<string>('');
  const speakingTimerRef = useRef<number | null>(null);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeConvIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, liveUserDraft, liveAssistantDraft]);

  const stopQueuedPlayback = () => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setAssistantSpeaking(false);
  };

  const persistCompletedTurn = async (userText: string, assistantText: string) => {
    if (!user) return;
    const trimmedUser = userText.trim().slice(0, 40000);
    const trimmedAssistant = assistantText.trim().slice(0, 40000);
    if (!trimmedUser && !trimmedAssistant) return;

    try {
      let convId = activeConvIdRef.current;
      if (!convId) {
        const seedTitle = trimmedUser || 'Voice Study Session';
        convId = await onEnsureConversation(seedTitle.slice(0, 48));
        activeConvIdRef.current = convId;
      }
      if (!convId) return;

      if (trimmedUser) {
        const msgId = makeDocId('msg');
        await setDoc(doc(db, 'aiMessages', msgId), {
          userId: user.uid,
          conversationId: convId,
          role: 'user',
          content: trimmedUser,
          citations: 'Voice Tutor Input',
          createdAt: serverTimestamp(),
        });
      }
      if (trimmedAssistant) {
        const msgId = makeDocId('msg');
        await setDoc(doc(db, 'aiMessages', msgId), {
          userId: user.uid,
          conversationId: convId,
          role: 'assistant',
          content: trimmedAssistant,
          citations: activeMaterial
            ? `Live Voice (${voiceName}) · Grounded in ${activeMaterial.title}`.slice(0, 400)
            : `Live Voice (${voiceName}) · General Academic Knowledge`.slice(0, 400),
          createdAt: serverTimestamp(),
        });
      }
      await updateDoc(doc(db, 'aiConversations', convId), {
        teachingMode,
        materialId: (activeMaterial?.id || '').slice(0, 128),
        unitCode: (unitCode || '').slice(0, 32),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      logFirestoreError(err, OperationType.WRITE, `aiMessages/${activeConvIdRef.current || 'new'}`);
      notify(
        'Could not save voice transcript turn',
        err instanceof Error ? err.message : 'Check your connection and try again.',
        'error',
      );
    }
  };

  const flushTurnToHistory = async () => {
    const uText = userDraftRef.current.trim();
    const aText = assistantDraftRef.current.trim();
    userDraftRef.current = '';
    assistantDraftRef.current = '';
    setLiveUserDraft('');
    setLiveAssistantDraft('');

    if (uText || aText) {
      const newItems: LiveTurn[] = [];
      if (uText) newItems.push({ id: `u_${Date.now()}`, role: 'user', text: uText });
      if (aText) newItems.push({ id: `a_${Date.now() + 1}`, role: 'assistant', text: aText });
      setTurns((prev) => [...prev, ...newItems]);
      await persistCompletedTurn(uText, aText);
    }
  };

  const teardownSession = (nextStatus: 'idle' | 'error' = 'idle') => {
    if (speakingTimerRef.current !== null) {
      window.clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }

    stopQueuedPlayback();

    try {
      processorRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    processorRef.current = null;
    sourceNodeRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'close' }));
        }
        ws.close();
      } catch {
        // Ignore
      }
    }

    setMicLevel(0);
    setStatus(nextStatus);
  };

  useEffect(() => {
    return () => {
      teardownSession('idle');
    };
  }, []);

  const playPcm24kChunk = (base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const float32 = base64Pcm24kToFloat32(base64Audio);
    if (!float32.length) return;

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    src.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(src);
    setAssistantSpeaking(true);

    src.onended = () => {
      activeSourcesRef.current.delete(src);
      if (activeSourcesRef.current.size === 0) {
        if (speakingTimerRef.current !== null) {
          window.clearTimeout(speakingTimerRef.current);
        }
        speakingTimerRef.current = window.setTimeout(() => {
          if (activeSourcesRef.current.size === 0) {
            setAssistantSpeaking(false);
          }
        }, 180);
      }
    };
  };

  const handleStartSession = async () => {
    if (!user || status === 'connecting' || status === 'live') return;

    setErrorMessage(null);
    setStatus('connecting');
    userDraftRef.current = '';
    assistantDraftRef.current = '';
    setLiveUserDraft('');
    setLiveAssistantDraft('');

    try {
      const token = await user.getIdToken();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      let inputCtx: AudioContext;
      try {
        inputCtx = new AudioCtx({ sampleRate: 16000 });
      } catch {
        inputCtx = new AudioCtx();
      }
      let outputCtx: AudioContext;
      try {
        outputCtx = new AudioCtx({ sampleRate: 24000 });
      } catch {
        outputCtx = new AudioCtx();
      }
      if (inputCtx.state === 'suspended') {
        await inputCtx.resume().catch(() => {});
      }
      if (outputCtx.state === 'suspended') {
        await outputCtx.resume().catch(() => {});
      }
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/api/live/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const contextSummary = chunks
        .slice(0, 6)
        .map((c, idx) => `[${c.sectionLabel || `Excerpt ${idx + 1}`}]\n${c.text.slice(0, 900)}`)
        .join('\n\n');

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'init',
            token,
            teachingMode,
            unitCode,
            voiceName,
            materialTitle: activeMaterial?.title || '',
            contextSummary,
          }),
        );
      };

      ws.onmessage = (event) => {
        let msg: {
          type: string;
          data?: string;
          text?: string;
          message?: string;
        };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          setStatus('live');
          // Start capturing microphone PCM 16kHz once Gemini Live session is ready
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          sourceNodeRef.current = source;
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
            const activeWs = wsRef.current;
            if (!activeWs || activeWs.readyState !== WebSocket.OPEN || isMutedRef.current) {
              setMicLevel(0);
              return;
            }
            const channelData = e.inputBuffer.getChannelData(0);
            let peak = 0;
            for (let i = 0; i < channelData.length; i += 16) {
              const abs = Math.abs(channelData[i]);
              if (abs > peak) peak = abs;
            }
            setMicLevel(Math.min(1, peak * 3));

            const base64 = float32ToPcm16Base64(channelData, inputCtx.sampleRate, 16000);
            activeWs.send(JSON.stringify({ type: 'audio', data: base64 }));
          };

          source.connect(processor);
          processor.connect(inputCtx.destination);
          notify('Voice session live', 'Speak naturally with your AI Academic Tutor.', 'success');
          return;
        }

        if (msg.type === 'audio' && msg.data) {
          playPcm24kChunk(msg.data);
          return;
        }

        if (msg.type === 'inputTranscript' && msg.text) {
          userDraftRef.current += msg.text;
          setLiveUserDraft(userDraftRef.current);
          return;
        }

        if (msg.type === 'outputTranscript' && msg.text) {
          assistantDraftRef.current += msg.text;
          setLiveAssistantDraft(assistantDraftRef.current);
          return;
        }

        if (msg.type === 'interrupted') {
          stopQueuedPlayback();
          flushTurnToHistory();
          return;
        }

        if (msg.type === 'turnComplete') {
          flushTurnToHistory();
          return;
        }

        if (msg.type === 'error') {
          const errText = msg.message || 'Live voice session encountered an error.';
          setErrorMessage(errText);
          notify('Voice tutor error', errText, 'error');
          teardownSession('error');
          return;
        }

        if (msg.type === 'closed') {
          flushTurnToHistory();
          teardownSession('idle');
        }
      };

      ws.onerror = () => {
        setErrorMessage('WebSocket connection failed. Check your connection and try again.');
        teardownSession('error');
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          flushTurnToHistory();
          teardownSession('idle');
        }
      };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Microphone permission denied or audio device unavailable.';
      setErrorMessage(msg);
      notify('Could not start voice tutor', msg, 'error');
      teardownSession('error');
    }
  };

  const handleStopSession = async () => {
    await flushTurnToHistory();
    teardownSession('idle');
    notify('Voice session ended', 'Transcript saved to your tutor thread.', 'info');
  };

  const handleSendTextCue = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = textCue.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'text', text: trimmed }));
    setTurns((prev) => [...prev, { id: `u_${Date.now()}`, role: 'user', text: trimmed }]);
    persistCompletedTurn(trimmed, '');
    setTextCue('');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Voice Controls Bar */}
      <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-950/70 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                status === 'live'
                  ? 'bg-emerald-500 animate-pulse'
                  : status === 'connecting'
                    ? 'bg-amber-500 animate-pulse'
                    : status === 'error'
                      ? 'bg-red-500'
                      : 'bg-slate-400'
              }`}
            />
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {status === 'live'
                ? assistantSpeaking
                  ? 'Tutor Speaking...'
                  : isMuted
                    ? 'Microphone Muted'
                    : 'Listening in Real Time'
                : status === 'connecting'
                  ? 'Connecting Voice Session...'
                  : status === 'error'
                    ? 'Session Interrupted'
                    : 'Ready for Voice Conversation'}
            </span>
          </div>

          <select
            value={voiceName}
            disabled={status === 'live' || status === 'connecting'}
            onChange={(e) => setVoiceName(e.target.value)}
            className="px-2.5 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 disabled:opacity-60"
            aria-label="Tutor voice"
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {status === 'live' && (
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border cursor-pointer ${
                isMuted
                  ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                  : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
              {isMuted ? 'Unmute' : 'Mute Mic'}
            </button>
          )}

          {status === 'live' || status === 'connecting' ? (
            <button
              type="button"
              onClick={handleStopSession}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              End Voice Chat
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStartSession}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5" />
              Start Live Voice
            </button>
          )}
        </div>
      </div>

      {/* Live Audio Activity Banner */}
      {status === 'live' && (
        <div className="px-5 py-2.5 bg-emerald-50/70 dark:bg-emerald-950/25 border-b border-emerald-200/70 dark:border-emerald-900/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-emerald-900 dark:text-emerald-200">
            <Volume2 className="w-4 h-4 shrink-0" />
            <span>
              Speak normally — interrupt anytime to ask follow-up questions.
              {activeMaterial ? ` Grounded in "${activeMaterial.title}".` : ''}
            </span>
          </div>
          <div className="flex items-end gap-1 h-4 shrink-0" aria-hidden="true">
            {[0.25, 0.5, 0.85, 0.6, 0.35].map((weight, i) => {
              const level = assistantSpeaking ? 0.75 : isMuted ? 0.08 : Math.max(0.12, micLevel);
              const pct = Math.min(100, Math.round(level * weight * 120));
              return (
                <span
                  key={i}
                  className="w-1 rounded-full bg-emerald-600 dark:bg-emerald-400 transition-all duration-100"
                  style={{ height: `${Math.max(20, pct)}%` }}
                />
              );
            })}
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {errorMessage}
        </div>
      )}

      {/* Live Transcript Stream */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {turns.length === 0 && !liveUserDraft && !liveAssistantDraft ? (
          <div className="py-12 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-900 mx-auto flex items-center justify-center text-emerald-700 dark:text-emerald-400">
              <Radio className="w-6 h-6" />
            </div>
            <h3 className="font-display text-base font-bold">
              Real-Time Voice Academic Tutor
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Practice oral exams, talk through difficult lecture concepts hands-free, or ask questions aloud about your uploaded PDF/DOCX notes. Spoken turns are automatically saved to your conversation history.
            </p>
          </div>
        ) : (
          <>
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex flex-col ${turn.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <span className="text-[10px] font-medium text-slate-400 mb-1">
                  {turn.role === 'user' ? 'You (Spoken)' : `AI Tutor (${voiceName})`}
                </span>
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                    turn.role === 'user'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {turn.text}
                </div>
              </div>
            ))}

            {liveUserDraft && (
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-medium text-emerald-600 mb-1">
                  Listening...
                </span>
                <div className="max-w-[85%] rounded-xl px-4 py-2.5 text-sm bg-emerald-600/90 text-white italic">
                  {liveUserDraft}
                </div>
              </div>
            )}

            {liveAssistantDraft && (
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-medium text-emerald-600 mb-1">
                  Tutor Speaking...
                </span>
                <div className="max-w-[85%] rounded-xl px-4 py-2.5 text-sm bg-slate-50 dark:bg-slate-950 border border-emerald-300 dark:border-emerald-800 text-slate-900 dark:text-slate-100">
                  {liveAssistantDraft}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={feedEndRef} />
      </div>

      {/* Optional Quick Text Cue During Live Voice Session */}
      {status === 'live' && (
        <form
          onSubmit={handleSendTextCue}
          className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2"
        >
          <input
            type="text"
            value={textCue}
            onChange={(e) => setTextCue(e.target.value)}
            placeholder="Optional: paste a formula or term for the tutor to discuss aloud..."
            className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
          />
          <button
            type="submit"
            disabled={!textCue.trim()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            Send Cue
          </button>
        </form>
      )}
    </div>
  );
}
