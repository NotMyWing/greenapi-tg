import { GreenApiTelegram, GreenApiError } from '../api/green-api';
import type { Credentials, InstanceSettings } from '../api/green-api';

export interface Session {
  client: GreenApiTelegram;
  idInstance: string;
  settings: InstanceSettings;
}

export async function connectSession(credentials: Credentials, signal: AbortSignal): Promise<Session> {
  const client = new GreenApiTelegram(credentials);
  const state = await client.getState(signal);
  signal.throwIfAborted();
  if (state !== 'authorized') throw new GreenApiError('Авторизуйте инстанс Telegram в кабинете GREEN-API и повторите вход.');
  const settings = await client.getSettings(signal);
  signal.throwIfAborted();
  return { client, idInstance: credentials.idInstance.trim(), settings };
}
