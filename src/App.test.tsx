// @vitest-environment jsdom
import { StrictMode } from "react";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { GreenApiError, GreenApiTelegram } from "./api/green-api";
import type { HistoryMessage, Notification } from "./api/green-api";

const phone = "79991234567";
const chatId = "123456";
let receive: (notification: Notification) => void;

beforeEach(() => {
  vi.spyOn(GreenApiTelegram.prototype, "getState").mockResolvedValue(
    "authorized",
  );
  vi.spyOn(GreenApiTelegram.prototype, "getSettings").mockResolvedValue({
    incomingWebhook: "yes",
    webhookUrl: "",
  });
  vi.spyOn(GreenApiTelegram.prototype, "getChats").mockResolvedValue([]);
  vi.spyOn(GreenApiTelegram.prototype, "getChatHistory").mockResolvedValue([]);
  vi.spyOn(GreenApiTelegram.prototype, "resolvePhone").mockResolvedValue({
    chatId,
  });
  vi.spyOn(GreenApiTelegram.prototype, "sendMessage").mockResolvedValue({
    idMessage: "sent-1",
  });
  vi.spyOn(GreenApiTelegram.prototype, "deleteNotification").mockResolvedValue(
    true,
  );
  vi.spyOn(
    GreenApiTelegram.prototype,
    "receiveNotification",
  ).mockImplementation(
    (signal) =>
      new Promise((resolve, reject) => {
        const abort = () => reject(new DOMException("Aborted", "AbortError"));
        if (signal?.aborted) return abort();
        signal?.addEventListener("abort", abort, { once: true });
        receive = (notification) => {
          signal?.removeEventListener("abort", abort);
          resolve(notification);
        };
      }),
  );
});

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function credentials(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("ID инстанса"), "4100000000");
  await user.type(screen.getByLabelText("Токен API"), "test-token");
  await user.click(screen.getByRole("button", { name: "Подключиться" }));
}

async function connect(strict = false) {
  const user = userEvent.setup();
  render(
    strict ? (
      <StrictMode>
        <App />
      </StrictMode>
    ) : (
      <App />
    ),
  );
  await credentials(user);
  await screen.findByRole("heading", { name: "Чаты" });
  return user;
}

async function openChat(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText("Номер телефона"),
    "+7 (999) 123-45-67",
  );
  await user.click(screen.getByRole("button", { name: "Новый чат" }));
  await screen.findByRole("heading", { name: `+${phone}` });
}

function draft() {
  return screen.getByRole<HTMLTextAreaElement>("textbox", {
    name: "Сообщение",
  });
}

describe("основной сценарий Telegram", () => {
  it("загружает существующие чаты после входа и историю без потери новых сообщений и черновика", async () => {
    vi.mocked(GreenApiTelegram.prototype.getChats).mockResolvedValue([
      { id: chatId, title: "Анна", phone },
    ]);
    let finishHistory!: (messages: HistoryMessage[]) => void;
    vi.mocked(GreenApiTelegram.prototype.getChatHistory).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishHistory = resolve;
        }),
    );
    const user = await connect(true);
    const navigation = within(
      screen.getByRole("navigation", { name: "Список чатов" }),
    );
    await user.click(await navigation.findByRole("button", { name: /Анна/ }));
    expect(GreenApiTelegram.prototype.getChats).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(GreenApiTelegram.prototype.getChatHistory).toHaveBeenCalledWith(
        chatId,
        expect.any(AbortSignal),
      ),
    );
    expect(GreenApiTelegram.prototype.resolvePhone).not.toHaveBeenCalled();
    await user.type(draft(), "Мой черновик");
    await act(async () =>
      receive({
        receiptId: 17,
        body: {
          typeWebhook: "incomingMessageReceived",
          idMessage: "reply-1",
          timestamp: 1763115112,
          senderData: { chatId, senderName: "Анна" },
          messageData: {
            typeMessage: "textMessage",
            textMessageData: { textMessage: "Новый ответ" },
          },
        },
      }),
    );
    await act(async () =>
      finishHistory([
        {
          id: "old-1",
          chatId,
          text: "Предыдущее сообщение",
          timestamp: 1763115000000,
          senderName: "Вы",
          direction: "outgoing",
          status: "sent",
        },
        {
          id: "reply-1",
          chatId,
          text: "Новый ответ",
          timestamp: 1763115112000,
          senderName: "Анна",
          direction: "incoming",
          status: "sent",
        },
      ]),
    );
    const messages = within(screen.getByRole("log", { name: "Сообщения" }));
    expect(messages.getByText("Предыдущее сообщение")).toBeTruthy();
    expect(messages.getAllByText("Новый ответ")).toHaveLength(1);
    expect(messages.getAllByRole("listitem")).toHaveLength(2);
    expect(draft().value).toBe("Мой черновик");
    expect(navigation.getAllByRole("button")).toHaveLength(1);
  });

  it("показывает сбой загрузки чатов и восстанавливает список после повтора", async () => {
    vi.mocked(GreenApiTelegram.prototype.getChats)
      .mockRejectedValueOnce(
        new GreenApiError("Не удалось загрузить чаты.", 503),
      )
      .mockResolvedValueOnce([{ id: chatId, title: "Анна" }]);
    const user = await connect();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Не удалось загрузить чаты",
    );
    expect(screen.queryByText("Нет чатов")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Повторить загрузку чатов" }),
    );
    expect(
      await within(screen.getByRole("navigation")).findByRole("button", {
        name: "Анна",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("позволяет повторить загрузку истории после сбоя", async () => {
    vi.mocked(GreenApiTelegram.prototype.getChats).mockResolvedValue([
      { id: chatId, title: "Анна" },
    ]);
    vi.mocked(GreenApiTelegram.prototype.getChatHistory)
      .mockRejectedValueOnce(
        new GreenApiError("Не удалось загрузить сообщения.", 503),
      )
      .mockResolvedValueOnce([
        {
          id: "old-1",
          chatId,
          text: "История чата",
          timestamp: 1763115000000,
          senderName: "Анна",
          direction: "incoming",
          status: "sent",
        },
      ]);
    const user = await connect();
    await user.click(
      await within(screen.getByRole("navigation")).findByRole("button", {
        name: "Анна",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Повторить загрузку сообщений",
      }),
    );
    expect(
      await within(screen.getByRole("log")).findByText(
        "История чата",
        {},
        { timeout: 2000 },
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("подключается, создаёт чат по телефону, отправляет текст и получает ответ", async () => {
    const user = await connect();
    await openChat(user);
    expect(GreenApiTelegram.prototype.resolvePhone).toHaveBeenCalledWith(
      phone,
      expect.any(AbortSignal),
    );
    await user.type(draft(), "Привет, Анна");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    expect(GreenApiTelegram.prototype.sendMessage).toHaveBeenCalledWith(
      chatId,
      "Привет, Анна",
      expect.any(AbortSignal),
    );
    expect(draft().value).toBe("");
    const messages = within(screen.getByRole("log", { name: "Сообщения" }));
    expect(messages.getByText("Привет, Анна")).toBeTruthy();
    expect(messages.getByText("В очереди")).toBeTruthy();
    await act(async () =>
      receive({
        receiptId: 17,
        body: {
          typeWebhook: "incomingMessageReceived",
          idMessage: "reply-1",
          timestamp: 1763115112,
          senderData: { chatId, senderName: "Анна" },
          messageData: {
            typeMessage: "textMessage",
            textMessageData: { textMessage: "Добрый день!" },
          },
        },
      }),
    );
    expect(messages.getByText("Добрый день!")).toBeTruthy();
    expect(messages.getAllByRole("listitem")).toHaveLength(2);
    expect(
      within(
        screen.getByRole("navigation", { name: "Список чатов" }),
      ).getAllByRole("button"),
    ).toHaveLength(1);
    expect(GreenApiTelegram.prototype.deleteNotification).toHaveBeenCalledWith(
      17,
      expect.any(AbortSignal),
    );
  });

  it("учитывает статус доставки, полученный до ответа sendMessage, и не откатывает галочки после прочтения", async () => {
    let finishSend!: (result: { idMessage: string }) => void;
    vi.mocked(GreenApiTelegram.prototype.sendMessage).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSend = resolve;
        }),
    );
    const user = await connect();
    await openChat(user);
    await user.type(draft(), "Проверка доставки");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    vi.useFakeTimers();
    const log = screen.getByRole("log", { name: "Сообщения" });
    const status = (value: string, receiptId: number): Notification => ({
      receiptId,
      body: {
        typeWebhook: "outgoingMessageStatus",
        chatId,
        idMessage: "sent-1",
        status: value,
      },
    });
    await act(async () => receive(status("delivered", 18)));
    await act(async () => finishSend({ idMessage: "sent-1" }));
    expect(
      log.querySelector(".status-delivered .message-check"),
    ).not.toBeNull();
    expect(within(log).queryByText("В очереди")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => receive(status("read", 19)));
    expect(log.querySelector(".status-read .message-check")).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => receive(status("delivered", 20)));
    expect(log.querySelector(".status-read .message-check")).not.toBeNull();
    expect(within(log).getAllByRole("listitem")).toHaveLength(1);
  });

  it.each(["отказ API", "неавторизованный инстанс"])(
    "оставляет форму доступной: %s",
    async (failure) => {
      if (failure === "отказ API") {
        vi.mocked(GreenApiTelegram.prototype.getState).mockRejectedValueOnce(
          new GreenApiError("Доступ запрещён.", 401),
        );
      } else {
        vi.mocked(GreenApiTelegram.prototype.getState).mockResolvedValueOnce(
          "notAuthorized",
        );
      }
      const user = userEvent.setup();
      render(<App />);
      await credentials(user);
      expect((await screen.findByRole("alert")).textContent).toMatch(
        /Доступ запрещён|Авторизуйте инстанс/,
      );
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: "Подключиться",
        }).disabled,
      ).toBe(false);
      expect(GreenApiTelegram.prototype.getSettings).not.toHaveBeenCalled();
      expect(
        GreenApiTelegram.prototype.receiveNotification,
      ).not.toHaveBeenCalled();
    },
  );

  it("объясняет настройку HTTP-очереди и начинает получение после повторной проверки", async () => {
    vi.mocked(GreenApiTelegram.prototype.getSettings).mockResolvedValueOnce({
      incomingWebhook: "no",
      webhookUrl: "https://example.com/hook",
    });
    const user = await connect();
    expect(
      screen.getByText(
        /включите входящие уведомления и очистите адрес webhook/,
      ),
    ).toBeTruthy();
    expect(
      GreenApiTelegram.prototype.receiveNotification,
    ).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: "Проверить подключение" }),
    );
    expect(GreenApiTelegram.prototype.getSettings).toHaveBeenCalledTimes(2);
    expect(GreenApiTelegram.prototype.receiveNotification).toHaveBeenCalledWith(
      expect.any(AbortSignal),
    );
    expect(
      screen.queryByText(
        /включите входящие уведомления и очистите адрес webhook/,
      ),
    ).toBeNull();
  });

  it("показывает ошибку поиска номера и позволяет исправить получателя", async () => {
    vi.mocked(GreenApiTelegram.prototype.resolvePhone).mockRejectedValueOnce(
      new GreenApiError("Аккаунт не найден."),
    );
    const user = await connect();
    await user.type(screen.getByLabelText("Номер телефона"), phone);
    await user.click(screen.getByRole("button", { name: "Новый чат" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Аккаунт не найден",
    );
    expect(
      screen.getByLabelText<HTMLInputElement>("Номер телефона").value,
    ).toBe(phone);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Новый чат" })
        .disabled,
    ).toBe(false);
    expect(screen.queryByRole("textbox", { name: "Сообщение" })).toBeNull();
  });

  it("сохраняет черновик после ошибки отправки без автоматического повтора", async () => {
    vi.mocked(GreenApiTelegram.prototype.sendMessage).mockRejectedValueOnce(
      new GreenApiError("Сервис недоступен.", 503),
    );
    const user = await connect();
    await openChat(user);
    await user.type(draft(), "Не потеряй этот текст");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    expect(await screen.findByText("Ошибка отправки")).toBeTruthy();
    expect(screen.getByText("Сервис недоступен.")).toBeTruthy();
    expect(draft().value).toBe("Не потеряй этот текст");
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(GreenApiTelegram.prototype.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("отправляет по Enter, сохраняет переносы, форматирует текст и экранирует HTML", async () => {
    const user = await connect();
    await openChat(user);
    await user.type(draft(), "   ");
    await user.keyboard("{Enter}");
    expect(GreenApiTelegram.prototype.sendMessage).not.toHaveBeenCalled();
    await user.clear(draft());
    await user.type(draft(), "*Привет*");
    await user.keyboard("{Shift>}{Enter}{/Shift}");
    await user.type(draft(), "<b>мир</b>");
    expect(draft().value).toBe("*Привет*\n<b>мир</b>");
    expect(GreenApiTelegram.prototype.sendMessage).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(GreenApiTelegram.prototype.sendMessage).toHaveBeenCalledWith(
      chatId,
      "*Привет*\n<b>мир</b>",
      expect.any(AbortSignal),
    );
    const log = screen.getByRole("log", { name: "Сообщения" });
    expect(log.textContent).toContain("Привет\n<b>мир</b>");
    expect(log.querySelector("strong")?.textContent).toBe("Привет");
    expect(log.querySelector("b, em")).toBeNull();
  });

  it("при отключении отменяет отправку и получение, очищает данные входа", async () => {
    vi.mocked(GreenApiTelegram.prototype.sendMessage).mockImplementation(
      (_chatId, _text, signal) =>
        new Promise((_, reject) => {
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const user = await connect();
    await openChat(user);
    await user.type(draft(), "Сообщение");
    await user.click(screen.getByRole("button", { name: "Отправить" }));
    const sendSignal = vi.mocked(GreenApiTelegram.prototype.sendMessage).mock
      .calls[0]?.[2];
    const receiveSignal = vi.mocked(
      GreenApiTelegram.prototype.receiveNotification,
    ).mock.calls[0]?.[0];
    await user.click(screen.getByRole("button", { name: "Отключиться" }));
    expect(sendSignal?.aborted).toBe(true);
    expect(receiveSignal?.aborted).toBe(true);
    expect(screen.getByLabelText<HTMLInputElement>("Токен API").value).toBe(
      "",
    );
    expect(
      screen.getByLabelText<HTMLInputElement>("ID инстанса").value,
    ).toBe("");
  });
});
