import crypto from 'node:crypto';
import type { PremiumPlanInfo } from '../../types/academic.ts';

export const PREMIUM_PLANS: Record<'scholar_monthly' | 'semester_pro', PremiumPlanInfo> = {
  scholar_monthly: {
    id: 'scholar_monthly',
    name: 'Scholar Monthly',
    billingLabel: 'per month (30 days)',
    amountKes: 350,
    durationDays: 30,
    recordingMinutesLimit: 600,
    aiMessagesPerDayLimit: 250,
    storageLimitMb: 2048,
    features: [
      '600 lecture recording & transcription minutes / month',
      '250 AI Tutor & Live Voice queries / day',
      '2 GB private lecture audio & RAG material storage',
      'Priority PDF & Word (.docx) note exports',
    ],
  },
  semester_pro: {
    id: 'semester_pro',
    name: 'Semester Pro',
    billingLabel: 'per semester (120 days)',
    amountKes: 950,
    durationDays: 120,
    recordingMinutesLimit: 5000,
    aiMessagesPerDayLimit: 1000,
    storageLimitMb: 10240,
    features: [
      '5,000 lecture recording & transcription minutes / semester',
      '1,000 AI Tutor & Gemini Live Voice sessions / day',
      '10 GB private academic audio & PDF storage',
      'Full mock exam simulator, flashcards & study exports',
    ],
  },
};

export interface DarajaConfig {
  environment: 'sandbox' | 'production';
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  webhookSecret: string;
}

export function getDarajaConfig(): DarajaConfig {
  const envRaw = (process.env.MPESA_ENVIRONMENT || 'sandbox').trim().toLowerCase();
  const environment = envRaw === 'production' ? 'production' : 'sandbox';
  const baseUrl =
    environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

  return {
    environment,
    baseUrl,
    consumerKey: (process.env.MPESA_CONSUMER_KEY || '').trim(),
    consumerSecret: (process.env.MPESA_CONSUMER_SECRET || '').trim(),
    shortCode: (process.env.MPESA_SHORTCODE || '').trim(),
    passkey: (process.env.MPESA_PASSKEY || '').trim(),
    webhookSecret: (process.env.PAYMENT_WEBHOOK_SECRET || '').trim(),
  };
}

export function isMpesaConfigured(): boolean {
  const cfg = getDarajaConfig();
  return Boolean(cfg.consumerKey && cfg.consumerSecret && cfg.shortCode && cfg.passkey);
}

/**
 * Normalizes Kenyan Safaricom/Airtel/Telkom phone numbers into Daraja MSISDN format: 2547XXXXXXXX or 2541XXXXXXXX.
 */
export function normalizeKenyanPhone(raw: string): string {
  const digits = (raw || '').replace(/[\s\-()+]/g, '');
  if (/^254(7|1)\d{8}$/.test(digits)) {
    return digits;
  }
  if (/^0(7|1)\d{8}$/.test(digits)) {
    return `254${digits.slice(1)}`;
  }
  if (/^(7|1)\d{8}$/.test(digits)) {
    return `254${digits}`;
  }
  throw new Error(
    'Enter a valid Kenyan M-Pesa phone number (e.g. 0712345678, 0112345678, or 254712345678).',
  );
}

export function maskKenyanPhone(msisdn: string): string {
  if (msisdn.length < 9) return '254***';
  return `${msisdn.slice(0, 5)}****${msisdn.slice(-3)}`;
}

/**
 * Formats Daraja timestamp YYYYMMDDHHmmss in East Africa Time (UTC+3).
 */
export function formatDarajaTimestamp(date = new Date()): string {
  const eatMs = date.getTime() + 3 * 60 * 60 * 1000;
  const eat = new Date(eatMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    eat.getUTCFullYear(),
    pad(eat.getUTCMonth() + 1),
    pad(eat.getUTCDate()),
    pad(eat.getUTCHours()),
    pad(eat.getUTCMinutes()),
    pad(eat.getUTCSeconds()),
  ].join('');
}

export function buildDarajaPassword(shortCode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`, 'utf8').toString('base64');
}

export function verifyWebhookSecret(provided?: string): boolean {
  const { webhookSecret } = getDarajaConfig();
  if (!webhookSecret) return true;
  if (!provided) return false;
  const a = Buffer.from(webhookSecret, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function getDarajaAccessToken(): Promise<string> {
  const cfg = getDarajaConfig();
  if (!isMpesaConfigured()) {
    throw new Error(
      'M-Pesa Daraja API credentials (MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY) are not configured in server Secrets.',
    );
  }

  const credentials = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`, 'utf8').toString('base64');
  const res = await fetch(`${cfg.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  const payload = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    errorMessage?: string;
    error?: string;
  };

  if (!res.ok || !payload.access_token) {
    throw new Error(payload.errorMessage || payload.error || `Daraja OAuth failed (${res.status}).`);
  }

  return payload.access_token;
}

export async function initiateMpesaStkPush(input: {
  plan: PremiumPlanInfo;
  phoneNumber: string;
  callbackUrl: string;
  accountRef: string;
}): Promise<{
  merchantRequestId: string;
  checkoutRequestId: string;
  responseCode: string;
  responseDescription: string;
  customerMessage: string;
  phoneMasked: string;
  environment: 'sandbox' | 'production';
}> {
  const cfg = getDarajaConfig();
  const msisdn = normalizeKenyanPhone(input.phoneNumber);
  const accessToken = await getDarajaAccessToken();
  const timestamp = formatDarajaTimestamp();
  const password = buildDarajaPassword(cfg.shortCode, cfg.passkey, timestamp);

  const body = {
    BusinessShortCode: cfg.shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(input.plan.amountKes),
    PartyA: msisdn,
    PartyB: cfg.shortCode,
    PhoneNumber: msisdn,
    CallBackURL: input.callbackUrl,
    AccountReference: input.accountRef.slice(0, 12),
    TransactionDesc: `Upgrade ${input.plan.id === 'semester_pro' ? 'Pro' : 'Scholar'}`.slice(0, 13),
  };

  const res = await fetch(`${cfg.baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as {
    MerchantRequestID?: string;
    CheckoutRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
    errorMessage?: string;
  };

  if (!res.ok || data.ResponseCode !== '0' || !data.CheckoutRequestID) {
    throw new Error(
      data.errorMessage ||
        data.ResponseDescription ||
        `M-Pesa STK Push failed (${res.status}).`,
    );
  }

  return {
    merchantRequestId: data.MerchantRequestID || '',
    checkoutRequestId: data.CheckoutRequestID,
    responseCode: data.ResponseCode,
    responseDescription: data.ResponseDescription || 'Success. Request accepted for processing',
    customerMessage: data.CustomerMessage || 'Enter your M-Pesa PIN on your phone to complete payment.',
    phoneMasked: maskKenyanPhone(msisdn),
    environment: cfg.environment,
  };
}

export async function queryMpesaStkPushStatus(checkoutRequestId: string): Promise<{
  resultCode: string;
  resultDesc: string;
  pending: boolean;
  succeeded: boolean;
  cancelled: boolean;
}> {
  const cfg = getDarajaConfig();
  const accessToken = await getDarajaAccessToken();
  const timestamp = formatDarajaTimestamp();
  const password = buildDarajaPassword(cfg.shortCode, cfg.passkey, timestamp);

  const res = await fetch(`${cfg.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: cfg.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ResultCode?: string | number;
    ResultDesc?: string;
    errorCode?: string;
    errorMessage?: string;
  };

  // Daraja returns errorCode "500.001.1001" ("The transaction is being processed") while customer has not yet entered PIN
  if (data.errorCode === '500.001.1001') {
    return {
      resultCode: 'PENDING',
      resultDesc: data.errorMessage || 'Transaction is still being processed by M-Pesa.',
      pending: true,
      succeeded: false,
      cancelled: false,
    };
  }

  if (!res.ok && data.ResultCode === undefined) {
    throw new Error(data.errorMessage || `M-Pesa status query failed (${res.status}).`);
  }

  const code = String(data.ResultCode ?? '');
  return {
    resultCode: code,
    resultDesc: data.ResultDesc || data.errorMessage || '',
    pending: false,
    succeeded: code === '0',
    cancelled: code === '1032',
  };
}

export interface ParsedDarajaCallback {
  checkoutRequestId: string;
  merchantRequestId: string;
  resultCode: number;
  resultDesc: string;
  mpesaReceiptNumber?: string;
  amountPaid?: number;
}

export function parseDarajaCallbackPayload(body: unknown): ParsedDarajaCallback | null {
  if (!body || typeof body !== 'object') return null;
  const stk = (body as { Body?: { stkCallback?: Record<string, unknown> } })?.Body?.stkCallback;
  if (!stk || typeof stk.CheckoutRequestID !== 'string') return null;

  const items =
    (stk.CallbackMetadata as { Item?: Array<{ Name?: string; Value?: unknown }> } | undefined)?.Item ||
    [];
  let mpesaReceiptNumber: string | undefined;
  let amountPaid: number | undefined;

  for (const item of items) {
    if (item.Name === 'MpesaReceiptNumber' && item.Value !== undefined) {
      mpesaReceiptNumber = String(item.Value);
    }
    if (item.Name === 'Amount' && typeof item.Value === 'number') {
      amountPaid = item.Value;
    }
  }

  return {
    checkoutRequestId: stk.CheckoutRequestID,
    merchantRequestId: typeof stk.MerchantRequestID === 'string' ? stk.MerchantRequestID : '',
    resultCode: Number(stk.ResultCode ?? -1),
    resultDesc: typeof stk.ResultDesc === 'string' ? stk.ResultDesc : '',
    mpesaReceiptNumber,
    amountPaid,
  };
}
