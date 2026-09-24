import type { Credentials } from '../api/utils/types.js';
import { isRecord, normalizeCredentials } from '../api/utils/validation.js';

export const SESSION_STORAGE_KEY = 'greenapi-telegram.session.v1';

/** Читает параметры текущей вкладки и удаляет повреждённую запись. */
export function readSession(): Credentials | null {
  try {
    const stored = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (stored === null) return null;
    const data: unknown = JSON.parse(stored);
    if (
      !isRecord(data) || typeof data.apiUrl !== 'string' ||
      typeof data.idInstance !== 'string' || typeof data.apiTokenInstance !== 'string'
    ) {
      clearSession();
      return null;
    }
    return normalizeCredentials({
      apiUrl: data.apiUrl,
      idInstance: data.idInstance,
      apiTokenInstance: data.apiTokenInstance,
    });
  } catch {
    clearSession();
    return null;
  }
}

/** Сохраняет только проверенные параметры подключения в текущей вкладке. */
export function saveSession(credentials: Credentials): boolean {
  try {
    const normalized = normalizeCredentials(credentials);
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

/** Удаляет только запись подключения, сохраняя остальные данные вкладки. */
export function clearSession(): boolean {
  try {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
