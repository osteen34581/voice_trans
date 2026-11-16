import { auth } from './firebase';

export async function getAuthToken(): Promise<string> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be signed in to perform this action.');
  }
  return user.getIdToken();
}

export async function apiJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '');
    throw new Error(
      !res.ok
        ? text || `Request failed with status ${res.status}`
        : `Unexpected non-JSON response from ${url}.`,
    );
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export async function fetchAuthorizedAudioUrl(lectureId: string): Promise<string> {
  const token = await getAuthToken();
  const res = await fetch(`/api/audio/${encodeURIComponent(lectureId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Could not load audio recording.');
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
