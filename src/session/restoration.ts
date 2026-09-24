import type { Credentials } from '../api/utils/types.js';
import { connectSession, connectionErrorMessage, isAuthenticationError } from './connection.js';
import type { Session } from './connection.js';
import { clearSession } from './storage.js';

export interface RestoredSession {
  session: Session | null;
  credentials: Credentials | null;
  error: string;
}

export interface SessionRestoration {
  readonly promise: Promise<RestoredSession>;
  cancel(): void;
}

/** Запускает восстановление при первом чтении promise и сохраняет его результат. */
export function createSessionRestoration(credentials: Credentials): SessionRestoration {
  const controller = new AbortController();
  let promise: Promise<RestoredSession> | undefined;

  return {
    get promise(): Promise<RestoredSession> {
      promise ??= connectSession(credentials, controller.signal).then(
        (session) => ({ session, credentials, error: '' }),
        (cause: unknown) => {
          // Отменённое восстановление не должно удалять данные нового подключения.
          if (controller.signal.aborted) return { session: null, credentials, error: '' };
          const authenticationFailed = isAuthenticationError(cause);
          if (authenticationFailed) clearSession();
          return {
            session: null,
            credentials: authenticationFailed ? null : credentials,
            error: connectionErrorMessage(cause),
          };
        },
      );
      return promise;
    },
    cancel() {
      controller.abort();
    },
  };
}
