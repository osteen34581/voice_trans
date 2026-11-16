import type { Server as HttpServer } from 'node:http';
import { URL } from 'node:url';
import { GoogleGenAI, Modality, type LiveServerMessage } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';
import { adminAuth } from '../firebase-admin.ts';
import { getServerConfig } from '../config.ts';

type LiveSession = Awaited<ReturnType<GoogleGenAI['live']['connect']>>;

const ALLOWED_VOICES = new Set(['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir']);
const ALLOWED_MODES = new Set(['beginner', 'intermediate', 'advanced', 'exam']);

interface InitPayload {
  type: 'init';
  token: string;
  teachingMode?: string;
  unitCode?: string;
  voiceName?: string;
  materialTitle?: string;
  contextSummary?: string;
}

interface AudioPayload {
  type: 'audio';
  data: string;
}

interface TextPayload {
  type: 'text';
  text: string;
}

interface ClosePayload {
  type: 'close';
}

type ClientLiveMessage = InitPayload | AudioPayload | TextPayload | ClosePayload;

function sendJson(ws: WebSocket, payload: Record<string, unknown>) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

export function attachLiveVoiceWebSocket(httpServer: HttpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname !== '/api/live/ws') {
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch {
      socket.destroy();
    }
  });

  wss.on('connection', (clientWs: WebSocket) => {
    let session: LiveSession | null = null;
    let sessionConnecting = false;
    let closed = false;

    const cleanup = () => {
      if (closed) return;
      closed = true;
      try {
        session?.close();
      } catch {
        // Ignore close errors during teardown
      }
      session = null;
    };

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);

    clientWs.on('message', async (raw) => {
      let msg: ClientLiveMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientLiveMessage;
      } catch {
        sendJson(clientWs, { type: 'error', message: 'Malformed Live message payload.' });
        return;
      }

      if (msg.type === 'close') {
        cleanup();
        clientWs.close();
        return;
      }

      if (msg.type === 'init') {
        if (session || sessionConnecting) return;
        sessionConnecting = true;

        try {
          if (!msg.token || typeof msg.token !== 'string') {
            sendJson(clientWs, { type: 'error', message: 'Authentication token is required.' });
            clientWs.close(1008, 'Unauthorized');
            return;
          }

          await adminAuth.verifyIdToken(msg.token);

          const apiKey = process.env.GEMINI_API_KEY;
          if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
            sendJson(clientWs, {
              type: 'error',
              message: 'GEMINI_API_KEY is not configured in server Secrets.',
            });
            clientWs.close(1011, 'API key missing');
            return;
          }

          const cfg = getServerConfig();
          const voiceName = msg.voiceName && ALLOWED_VOICES.has(msg.voiceName) ? msg.voiceName : 'Zephyr';
          const teachingMode =
            msg.teachingMode && ALLOWED_MODES.has(msg.teachingMode) ? msg.teachingMode : 'intermediate';
          const unitCode = typeof msg.unitCode === 'string' ? msg.unitCode.trim().slice(0, 32) : '';
          const materialTitle =
            typeof msg.materialTitle === 'string' ? msg.materialTitle.trim().slice(0, 160) : '';
          const contextSummary =
            typeof msg.contextSummary === 'string' ? msg.contextSummary.trim().slice(0, 8000) : '';

          const modeHints: Record<string, string> = {
            beginner: 'Explain concepts clearly from first principles with everyday analogies and frequent checks.',
            intermediate: 'Connect concepts step by step at undergraduate level with clear examples.',
            advanced: 'Use rigorous university-level terminology, critical analysis, and formal derivations.',
            exam: 'Coach at Kenyan university exam standard: crisp definitions, marking points, and practice prompts.',
          };

          const systemInstruction = [
            'You are a real-time spoken AI Academic Tutor supporting university students in Kenya.',
            `Teaching Mode: ${teachingMode.toUpperCase()} — ${modeHints[teachingMode]}`,
            unitCode ? `Active Unit Code: ${unitCode}.` : '',
            materialTitle ? `Attached Study Material: ${materialTitle}.` : '',
            contextSummary ? `Reference Excerpts from Student Material:\n${contextSummary}` : '',
            'Keep spoken answers concise, structured, conversational, and academically honest. If a detail is not in the provided material excerpts, say so clearly and distinguish general academic knowledge.',
          ]
            .filter(Boolean)
            .join('\n\n');

          const ai = new GoogleGenAI({
            apiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          session = await ai.live.connect({
            model: cfg.liveModel,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName,
                  },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction,
            },
            callbacks: {
              onopen: () => {
                sendJson(clientWs, {
                  type: 'ready',
                  model: cfg.liveModel,
                  voiceName,
                });
              },
              onmessage: (message: LiveServerMessage) => {
                const serverContent = message.serverContent;
                if (!serverContent) return;

                if (serverContent.inputTranscription?.text) {
                  sendJson(clientWs, {
                    type: 'inputTranscript',
                    text: serverContent.inputTranscription.text,
                  });
                }

                if (serverContent.outputTranscription?.text) {
                  sendJson(clientWs, {
                    type: 'outputTranscript',
                    text: serverContent.outputTranscription.text,
                  });
                }

                for (const part of serverContent.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendJson(clientWs, {
                      type: 'audio',
                      data: part.inlineData.data,
                    });
                  }
                }

                if (serverContent.interrupted) {
                  sendJson(clientWs, { type: 'interrupted' });
                }

                if (serverContent.turnComplete) {
                  sendJson(clientWs, { type: 'turnComplete' });
                }
              },
              onerror: (err: unknown) => {
                const errMsg =
                  err instanceof Error
                    ? err.message
                    : typeof err === 'object' && err && 'message' in err
                      ? String((err as { message?: unknown }).message)
                      : 'Live voice session encountered an error.';
                sendJson(clientWs, { type: 'error', message: errMsg });
              },
              onclose: () => {
                if (!closed) {
                  sendJson(clientWs, { type: 'closed' });
                }
              },
            },
          });

          if (closed) {
            try {
              session.close();
            } catch {
              // Ignore
            }
            session = null;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unable to start voice conversation.';
          sendJson(clientWs, { type: 'error', message });
          clientWs.close(1011, 'Live init error');
        } finally {
          sessionConnecting = false;
        }
        return;
      }

      if (!session || closed) {
        return;
      }

      if (msg.type === 'audio' && typeof msg.data === 'string' && msg.data.length > 0) {
        try {
          session.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch {
          // Session may already be closing
        }
        return;
      }

      if (msg.type === 'text' && typeof msg.text === 'string' && msg.text.trim().length > 0) {
        try {
          session.sendRealtimeInput({
            text: msg.text.trim().slice(0, 2000),
          });
        } catch {
          // Session may already be closing
        }
      }
    });
  });

  return wss;
}
