import {
  GreenApiError,
  errorMessage,
  parseOutgoingStatus,
  parseTextMessage,
} from "../api/green-api";
import type {
  GreenApiTelegram,
  IncomingTextMessage,
  Notification,
  OutgoingMessageStatus,
} from "../api/green-api";

function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

export async function pollNotifications(
  client: Pick<GreenApiTelegram, "receiveNotification" | "deleteNotification">,
  {
    signal,
    onMessage,
    onStatus,
    onError,
  }: {
    signal: AbortSignal;
    onMessage: (message: IncomingTextMessage) => void;
    onStatus: (status: OutgoingMessageStatus) => void;
    onError: (error: string | null) => void;
  },
): Promise<void> {
  let pending: Notification | null = null;
  let processed = false;
  while (!signal.aborted) {
    try {
      pending ??= await client.receiveNotification(signal);
      if (signal.aborted) return;
      if (pending) {
        if (!processed) {
          const message = parseTextMessage(pending.body);
          if (message) onMessage(message);
          const status = parseOutgoingStatus(pending.body);
          if (status) onStatus(status);
          processed = true;
        }
        if (signal.aborted) return;
        // После сбоя повторяем удаление по тому же receiptId.
        await client.deleteNotification(pending.receiptId, signal);
        if (signal.aborted) return;
        pending = null;
        processed = false;
      }
      onError(null);
      await pause(1000, signal);
    } catch (cause) {
      if (signal.aborted) return;
      const status = cause instanceof GreenApiError ? cause.status : undefined;
      onError(status === 408 && !pending ? null : errorMessage(cause));
      if (status === 401 || status === 403) return;
      await pause(status === 429 ? 30_000 : 3000, signal);
    }
  }
}
