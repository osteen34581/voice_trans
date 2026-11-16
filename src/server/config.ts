export interface AppServerConfig {
  aiProvider: string;
  textModel: string;
  transcribeModel: string;
  embeddingModel: string;
  liveModel: string;
  geminiConfigured: boolean;
  adminEmails: string[];
  defaultLimits: {
    freeRecordingMinutes: number;
    freeAiMessagesPerDay: number;
    freeStorageLimitMb: number;
  };
}

function validModel(envVal: string | undefined, fallback: string): string {
  const trimmed = envVal?.trim() || '';
  return /^(gemini|lyria)-[a-z0-9.\-]+$/i.test(trimmed) ? trimmed : fallback;
}

export function getServerConfig(): AppServerConfig {
  const adminEmailsRaw = process.env.ADMIN_EMAILS || '';
  const parsedAdmins = adminEmailsRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes('@'));
  const adminEmails = parsedAdmins.length > 0 ? parsedAdmins : ['austinelapi@gmail.com'];
  if (!adminEmails.includes('austinelapi@gmail.com')) {
    adminEmails.push('austinelapi@gmail.com');
  }

  const providerRaw = (process.env.AI_PROVIDER || '').trim().toLowerCase();

  return {
    aiProvider: providerRaw === 'gemini' ? 'gemini' : 'gemini',
    textModel: validModel(process.env.AI_TEXT_MODEL, 'gemini-4-hydrogen'),
    transcribeModel: validModel(process.env.AI_TRANSCRIBE_MODEL, 'gemini-3.5-transcribe'),
    embeddingModel: validModel(process.env.AI_EMBEDDING_MODEL, 'gemini-embedding-2'),
    liveModel: validModel(process.env.AI_LIVE_MODEL, 'gemini-3.8-live'),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
    adminEmails,
    defaultLimits: {
      freeRecordingMinutes: Number(process.env.FREE_MONTHLY_RECORDING_MINUTES || 120),
      freeAiMessagesPerDay: Number(process.env.FREE_DAILY_AI_MESSAGES || 40),
      freeStorageLimitMb: Number(process.env.FREE_STORAGE_LIMIT_MB || 250),
    },
  };
}
