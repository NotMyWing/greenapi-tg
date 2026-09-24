import type { Credentials } from './types.js';
import { isRecord } from './validation.js';
import { GreenApiError, invalidResponse, safeApiError } from './errors.js';

export type ApiMethod =
  | 'getStateInstance'
  | 'getSettings'
  | 'checkAccount'
  | 'sendMessage'
  | 'receiveNotification'
  | 'deleteNotification';

export interface RequestOptions {
  verb?: 'GET' | 'POST' | 'DELETE';
  body?: Record<string, unknown>;
  suffix?: string;
  signal?: AbortSignal;
  timeout?: number;
}

export const RECEIVE_TIMEOUT_SECONDS = 30;
export const NOTIFICATION_REQUEST_TIMEOUT_MS = 40_000;

/** Выполняет один запрос с отменой и таймаутом; автоматически не повторяет его. */
export async function request(
  credentials: Credentials,
  method: ApiMethod,
  options: RequestOptions = {},
): Promise<unknown> {
  const { apiUrl, idInstance, apiTokenInstance } = credentials;
  const url = `${apiUrl}/waInstance${idInstance}/${method}/${encodeURIComponent(apiTokenInstance)}${options.suffix ?? ''}`;
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) throw new DOMException('Запрос отменён.', 'AbortError');
  options.signal?.addEventListener('abort', abort, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeout ?? 20_000);

  try {
    const response = await fetch(url, {
      method: options.verb ?? 'GET',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
    });
    const text = await response.text();
    if (!response.ok) throw safeApiError(response.status, text);
    if (!text.trim()) return null;
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw invalidResponse();
    }
    if (isRecord(data) && data.status === false) throw safeApiError(0, text);
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException('Запрос отменён.', 'AbortError');
    if (error instanceof GreenApiError) throw error;
    const message = timedOut
      ? 'GREEN-API не ответил вовремя.'
      : 'Не удалось связаться с GREEN-API. Проверьте интернет и apiUrl.';
    const sendHint = method === 'sendMessage'
      ? ' Перед повтором проверьте чат в Telegram: сообщение могло быть отправлено.'
      : ' Попробуйте ещё раз.';
    throw new GreenApiError(message + sendHint);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
}
