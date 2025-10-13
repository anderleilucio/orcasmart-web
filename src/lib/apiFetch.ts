// src/lib/apiFetch.ts
import { auth } from '@/lib/firebase';

export async function apiFetch(path: string, init: RequestInit = {}) {
  const idToken = await auth.currentUser?.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'Content-Type': 'application/json',
      Authorization: idToken ? `Bearer ${idToken}` : '',
    },
  });
}