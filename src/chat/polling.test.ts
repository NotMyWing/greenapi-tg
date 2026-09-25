import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GreenApiError, GreenApiTelegram } from "../api/green-api";
import type { Notification } from "../api/green-api";
import { pollNotifications } from "./polling";

const notification: Notification = {
  receiptId: 17,
  body: {
    typeWebhook: "incomingMessageReceived",
    idMessage: "reply-1",
    timestamp: 1763115112,
    senderData: { chatId: "123456", senderName: "Анна" },
    messageData: {
      typeMessage: "textMessage",
      textMessageData: { textMessage: "Привет!" },
    },
  },
};
const controllers: AbortController[] = [];

function setup() {
  const controller = new AbortController();
  controllers.push(controller);
  const client = {
    receiveNotification: vi
      .fn<GreenApiTelegram["receiveNotification"]>()
      .mockResolvedValue(null),
    deleteNotification: vi
      .fn<GreenApiTelegram["deleteNotification"]>()
      .mockResolvedValue(true),
  };
  const onMessage = vi.fn();
  const onStatus = vi.fn();
  const onError = vi.fn();
  return {
    client,
    controller,
    onMessage,
    onStatus,
    onError,
    start: () =>
      pollNotifications(client, {
        signal: controller.signal,
        onMessage,
        onStatus,
        onError,
      }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(async () => {
  controllers.splice(0).forEach((controller) => controller.abort());
  await vi.runAllTimersAsync();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("очередь уведомлений", () => {
  it("повторяет опрос без предупреждения после HTTP 408 и локального таймаута, но сообщает об ошибках удаления", async () => {
    const { controller, onMessage, onStatus, onError } = setup();
    const timeout: typeof fetch = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 408 }))
      .mockImplementationOnce(timeout)
      .mockResolvedValueOnce(new Response(JSON.stringify(notification)))
      .mockImplementationOnce(timeout)
      .mockResolvedValueOnce(new Response('{"result":true}'));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GreenApiTelegram({
      apiUrl: "",
      idInstance: "4100000000",
      apiTokenInstance: "test-token",
    });
    const done = pollNotifications(client, {
      signal: controller.signal,
      onMessage,
      onStatus,
      onError,
    });
    await vi.advanceTimersByTimeAsync(43_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls).toEqual([[null], [null]]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ id: "reply-1" }),
    );
    await vi.advanceTimersByTimeAsync(20_000);
    expect(onError).toHaveBeenLastCalledWith(
      "GREEN-API не ответил вовремя. Попробуйте ещё раз.",
    );
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[4]?.[0]).toContain(
      "/deleteNotification/test-token/17",
    );
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenLastCalledWith(null);
    controller.abort();
    await done;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("обрабатывает текст и статусы до удаления и подтверждает неизвестные события", async () => {
    const { client, onMessage, onStatus, controller, start } = setup();
    client.receiveNotification
      .mockResolvedValueOnce(notification)
      .mockResolvedValueOnce({
        receiptId: 18,
        body: {
          typeWebhook: "outgoingMessageStatus",
          chatId: "123456",
          idMessage: "sent-1",
          status: "read",
        },
      })
      .mockResolvedValueOnce({ receiptId: 19, body: null });
    client.deleteNotification
      .mockImplementationOnce(async () => {
        expect(onMessage).toHaveBeenCalledWith(
          expect.objectContaining({ id: "reply-1", text: "Привет!" }),
        );
        return true;
      })
      .mockImplementationOnce(async () => {
        expect(onStatus).toHaveBeenCalledWith({
          chatId: "123456",
          messageId: "sent-1",
          status: "read",
        });
        return true;
      });
    const done = start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.deleteNotification).toHaveBeenCalledWith(
      17,
      controller.signal,
    );
    expect(client.receiveNotification).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.deleteNotification).toHaveBeenLastCalledWith(
      18,
      controller.signal,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(client.deleteNotification).toHaveBeenLastCalledWith(
      19,
      controller.signal,
    );
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenCalledTimes(1);
    controller.abort();
    await done;
  });

  it("повторяет неудачное удаление того же уведомления без повторной обработки или получения", async () => {
    const { client, onMessage, controller, start } = setup();
    client.receiveNotification.mockResolvedValueOnce(notification);
    client.deleteNotification.mockRejectedValueOnce(
      new GreenApiError("Сервис недоступен.", 503),
    );
    const done = start();
    await vi.advanceTimersByTimeAsync(2999);
    expect(client.deleteNotification).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.deleteNotification).toHaveBeenCalledTimes(2);
    expect(client.deleteNotification).toHaveBeenLastCalledWith(
      17,
      controller.signal,
    );
    expect(client.receiveNotification).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledTimes(1);
    controller.abort();
    await done;
  });

  it("после 429 ждёт 30 секунд, а отмена прерывает активный запрос", async () => {
    const { client, onError, controller, start } = setup();
    client.receiveNotification
      .mockRejectedValueOnce(new GreenApiError("Слишком много запросов.", 429))
      .mockImplementationOnce(
        (signal) =>
          new Promise((_, reject) => {
            signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      );
    const done = start();
    await vi.advanceTimersByTimeAsync(29_999);
    expect(client.receiveNotification).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(client.receiveNotification).toHaveBeenCalledTimes(2);
    expect(client.receiveNotification).toHaveBeenLastCalledWith(
      controller.signal,
    );
    expect(onError).toHaveBeenCalledTimes(1);
    controller.abort();
    await expect(done).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("останавливается при отказе доступа и показывает причину", async () => {
    const { client, onError, start } = setup();
    client.receiveNotification.mockRejectedValueOnce(
      new GreenApiError("Доступ запрещён.", 401),
    );
    await start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(client.receiveNotification).toHaveBeenCalledTimes(1);
    expect(client.deleteNotification).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Доступ запрещён.");
  });
});
