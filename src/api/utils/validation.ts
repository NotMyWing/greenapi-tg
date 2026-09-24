import { GreenApiError, invalidResponse } from './errors.js';
import type { Credentials, InstanceSettings, Notification, ResolvedChat, SentMessage } from './types.js';

export const MAX_MESSAGE_LENGTH = 4096;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function normalizePhone(value: string): string {
  const input = value.trim();
  const phone = input.replace(/[\s().-]/g, '').replace(/^\+/, '');
  if (!/^\+?[\d\s().-]+$/.test(input) || !/^[1-9]\d{6,14}$/.test(phone)) {
    throw new GreenApiError('Введите номер с кодом страны: от 7 до 15 цифр, например +7 999 123-45-67.');
  }
  return phone;
}

/** Проверяет параметры подключения и возвращает их копию. */
export function normalizeCredentials(credentials: Credentials): Credentials {
  let url: URL;
  try {
    url = new URL(credentials.apiUrl.trim());
  } catch {
    throw new GreenApiError('Укажите apiUrl из личного кабинета GREEN-API, начиная с https://.');
  }
  if (
    url.protocol !== 'https:' || url.username || url.password ||
    url.pathname !== '/' || url.search || url.hash
  ) {
    throw new GreenApiError('apiUrl должен содержать только HTTPS-адрес сервера из личного кабинета.');
  }
  const idInstance = credentials.idInstance.trim();
  const apiTokenInstance = credentials.apiTokenInstance.trim();
  if (!/^\d+$/.test(idInstance)) {
    throw new GreenApiError('idInstance должен содержать только цифры.');
  }
  if (!/^[\w-]+$/.test(apiTokenInstance)) {
    throw new GreenApiError('Укажите корректный apiTokenInstance из личного кабинета.');
  }
  return { apiUrl: url.origin, idInstance, apiTokenInstance };
}

export function parseState(data: unknown): string {
  if (!isRecord(data) || !isText(data.stateInstance)) throw invalidResponse();
  return data.stateInstance;
}

export function parseSettings(data: unknown): InstanceSettings {
  if (
    !isRecord(data) || typeof data.webhookUrl !== 'string' ||
    (data.incomingWebhook !== 'yes' && data.incomingWebhook !== 'no')
  ) throw invalidResponse();
  if (data.typeInstance !== undefined && data.typeInstance !== 'telegram') {
    throw new GreenApiError('Выберите инстанс Telegram в личном кабинете GREEN-API.');
  }
  return { incomingWebhook: data.incomingWebhook, webhookUrl: data.webhookUrl };
}

export function parseResolvedChat(data: unknown): ResolvedChat {
  if (!isRecord(data) || typeof data.exist !== 'boolean') throw invalidResponse();
  if (!data.exist) {
    throw new GreenApiError('Аккаунт Telegram не найден или поиск по номеру ограничен настройками приватности.');
  }
  if (typeof data.chatId !== 'string' || !/^[1-9]\d*$/.test(data.chatId)) throw invalidResponse();
  return { chatId: data.chatId };
}

export function validateMessage(chatId: string, message: string): void {
  if (!/^-?[1-9]\d*$/.test(chatId)) throw new GreenApiError('Некорректный идентификатор чата Telegram.');
  if (!message.trim()) throw new GreenApiError('Введите текст сообщения.');
  if (message.length > MAX_MESSAGE_LENGTH) throw new GreenApiError('Сообщение должно содержать не более 4096 символов.');
}

export function parseSentMessage(data: unknown): SentMessage {
  if (!isRecord(data) || !isText(data.idMessage)) throw invalidResponse();
  return { idMessage: data.idMessage };
}

export function parseNotification(data: unknown): Notification | null {
  if (data === null) return null;
  if (
    !isRecord(data) || typeof data.receiptId !== 'number' ||
    !Number.isSafeInteger(data.receiptId) || data.receiptId < 0 || !('body' in data)
  ) throw invalidResponse();
  return { receiptId: data.receiptId, body: data.body };
}

export function validateReceiptId(receiptId: number): void {
  if (!Number.isSafeInteger(receiptId) || receiptId < 0) throw new GreenApiError('Некорректный идентификатор уведомления.');
}

export function parseDeletionResult(data: unknown): boolean {
  if (!isRecord(data) || typeof data.result !== 'boolean') throw invalidResponse();
  return data.result;
}
