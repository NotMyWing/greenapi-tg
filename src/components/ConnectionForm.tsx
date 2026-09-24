import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  DEFAULT_API_URL,
  errorMessage,
  type Credentials,
} from "../api/green-api";
import { connectSession } from "../session/connection";
import type { Session } from "../session/connection";

export function ConnectionForm({
  onConnect,
}: {
  onConnect: (session: Session) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);

  async function connect(credentials: Credentials) {
    if (pending.current) return;

    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");

    try {
      const session = await connectSession(credentials, controller.signal);
      if (!controller.signal.aborted) onConnect(session);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(errorMessage(cause));
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
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void connect({
      apiUrl: String(data.get("apiUrl") ?? ""),
      idInstance: String(data.get("idInstance") ?? ""),
      apiTokenInstance: String(data.get("apiTokenInstance") ?? ""),
    });
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Подключение к GREEN-API"
      aria-busy={busy}
    >
      <fieldset disabled={busy}>
        <legend className="visually-hidden">Данные инстанса</legend>
        <label htmlFor="instance-id">ID инстанса</label>
        <input
          id="instance-id"
          name="idInstance"
          type="text"
          inputMode="numeric"
          pattern="[0-9]+"
          placeholder="4100000000"
          required
          autoComplete="off"
        />

        <label htmlFor="api-token">Токен API</label>
        <input
          id="api-token"
          name="apiTokenInstance"
          type="password"
          placeholder="apiTokenInstance"
          required
          autoComplete="off"
          spellCheck={false}
        />

        <label htmlFor="api-url">Адрес API (необязательно)</label>
        <input
          id="api-url"
          name="apiUrl"
          type="url"
          placeholder={DEFAULT_API_URL}
          autoComplete="off"
          spellCheck={false}
          aria-describedby="api-url-hint"
        />
        <p id="api-url-hint" className="field-hint">
          Оставьте пустым, чтобы использовать стандартный сервер GREEN-API.
        </p>
      </fieldset>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? "Проверяем подключение…" : "Подключиться"}
        </button>
        {busy && (
          <button className="button secondary" type="button" onClick={cancel}>
            Отменить
          </button>
        )}
      </div>
    </form>
  );
}
