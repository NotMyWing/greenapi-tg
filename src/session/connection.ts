import { GreenApiTelegram } from '../api/green-api.js';
import { GreenApiError } from '../api/utils/errors.js';
import type { Credentials, InstanceSettings } from '../api/utils/types.js';

export interface Session {
  client: GreenApiTelegram;
  idInstance: string;
  settings: InstanceSettings;
}

/** Инстанс требует авторизации в кабинете GREEN-API. */
export class InstanceNotAuthorizedError extends GreenApiError {
  constructor() {
    super('Авторизуйте инстанс Telegram в кабинете GREEN-API и повторите вход.');
    this.name = 'InstanceNotAuthorizedError';
  }
}

/** Проверяет авторизацию и читает настройки, учитывая отмену между запросами. */
export async function connectSession(credentials: Credentials, signal: AbortSignal): Promise<Session> {
  signal.throwIfAborted();
  const client = new GreenApiTelegram(credentials);
  const state = await client.getState(signal);
  signal.throwIfAborted();
  if (state !== 'authorized') throw new InstanceNotAuthorizedError();
  const settings = await client.getSettings(signal);
  signal.throwIfAborted();
  return { client, idInstance: credentials.idInstance.trim(), settings };
}

export function isAuthenticationError(cause: unknown): boolean {
  return cause instanceof InstanceNotAuthorizedError ||
    (cause instanceof GreenApiError && (cause.status === 401 || cause.status === 403));
}

/** Не выводит исходный текст неизвестных ошибок, который может содержать токен. */
export function connectionErrorMessage(cause: unknown): string {
  return cause instanceof GreenApiError
    ? cause.message
    : 'Не удалось проверить подключение. Повторите попытку.';
}
