import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Credentials } from '../index';
import { connectSession, connectionErrorMessage, isAuthenticationError } from '../session/connection';
import type { Session } from '../session/connection';

interface ConnectionFormProps {
  initialCredentials: Credentials | null;
  initialError?: string;
  onConnect: (session: Session, credentials: Credentials) => void;
  onForget: () => void;
}

export function ConnectionForm({ initialCredentials, initialError = '', onConnect, onForget }: ConnectionFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const pending = useRef<AbortController | null>(null);

  async function connect(credentials: Credentials) {
    if (pending.current) return;

    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError('');

    try {
      const session = await connectSession(credentials, controller.signal);
      if (!controller.signal.aborted) onConnect(session, credentials);
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (isAuthenticationError(cause)) onForget();
        setError(connectionErrorMessage(cause));
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setBusy(false);
      }
    }
  }

  useEffect(() => () => pending.current?.abort(), []);

  function cancel() {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    onForget();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void connect({
      apiUrl: String(data.get('apiUrl') ?? ''),
      idInstance: String(data.get('idInstance') ?? ''),
      apiTokenInstance: String(data.get('apiTokenInstance') ?? ''),
    });
  }

  return (
    <form onSubmit={submit} aria-label="Подключение к GREEN-API" aria-busy={busy}>
      <fieldset disabled={busy}>
        <legend className="visually-hidden">Данные инстанса</legend>
        <label htmlFor="api-url">Адрес API</label>
        <input id="api-url" name="apiUrl" type="url" defaultValue={initialCredentials?.apiUrl} placeholder="https://4100.api.green-api.com" required autoComplete="off" spellCheck={false} aria-describedby="api-url-hint" />
        <p id="api-url-hint" className="field-hint">Скопируйте apiUrl из личного кабинета.</p>

        <label htmlFor="instance-id">ID инстанса</label>
        <input id="instance-id" name="idInstance" type="text" defaultValue={initialCredentials?.idInstance} inputMode="numeric" pattern="[0-9]+" placeholder="4100000000" required autoComplete="off" />

        <label htmlFor="api-token">Токен API</label>
        <input id="api-token" name="apiTokenInstance" type="password" defaultValue={initialCredentials?.apiTokenInstance} placeholder="apiTokenInstance" required autoComplete="off" spellCheck={false} aria-describedby="token-hint" />
        <p id="token-hint" className="field-hint">Подключение сохранится после обновления этой вкладки. Кнопка «Отключиться» удалит данные.</p>
      </fieldset>

      {error && <p className="notice error" role="alert">{error}</p>}
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? 'Проверяем подключение…' : 'Подключиться'}
        </button>
        {busy && <button className="button secondary" type="button" onClick={cancel}>Отменить</button>}
      </div>
    </form>
  );
}
