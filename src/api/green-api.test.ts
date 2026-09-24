import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_API_URL,
  GreenApiError,
  GreenApiTelegram,
  MAX_MESSAGE_LENGTH,
  normalizePhone,
  parseOutgoingStatus,
  parseTextMessage,
} from "./green-api";

const credentials = {
  apiUrl: "",
  idInstance: "4100000000",
  apiTokenInstance: "test-token",
};
const endpoint = `${DEFAULT_API_URL}/waInstance4100000000`;
const incoming = {
  typeWebhook: "incomingMessageReceived",
  idMessage: "reply-1",
  timestamp: 1763115112,
  senderData: { chatId: "123456", senderName: "Анна" },
  messageData: {
    typeMessage: "textMessage",
    textMessageData: { textMessage: "Привет!" },
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HTTP-контракт GREEN-API Telegram", () => {
  it("использует правильные методы, адреса и данные для полного обмена", async () => {
    const responses = [
      { stateInstance: "authorized" },
      { typeInstance: "telegram", incomingWebhook: "yes", webhookUrl: "" },
      [
        {
          chatId: "123456",
          name: "Анна",
          type: "user",
          phoneNumber: 79991234567,
        },
        {
          chatId: "-100001",
          name: "",
          username: "@group",
          type: "supergroup",
          phoneNumber: 0,
        },
        { chatId: "-100002", name: "Новости", type: "channel", phoneNumber: 0 },
      ],
      [
        {
          idMessage: "old-read",
          chatId: "123456",
          type: "outgoing",
          typeMessage: "textMessage",
          textMessage: "Хорошо",
          timestamp: 1763115112,
          statusMessage: "read",
        },
        {
          idMessage: "old-outgoing",
          chatId: "123456",
          type: "outgoing",
          typeMessage: "textMessage",
          textMessage: "До встречи",
          timestamp: 1763115111,
          statusMessage: "delivered",
        },
        {
          idMessage: "old-incoming",
          chatId: "123456",
          type: "incoming",
          typeMessage: "textMessage",
          textMessage: "Привет",
          timestamp: 1763115110,
          senderName: "Анна",
        },
        { typeMessage: "imageMessage" },
        { typeMessage: "textMessage", isDeleted: true },
      ],
      { exist: true, chatId: "123456" },
      { idMessage: "sent-1" },
      { receiptId: 17, body: incoming },
      { result: true },
      null,
    ];
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(
        async () => new Response(JSON.stringify(responses.shift())),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new GreenApiTelegram(credentials);
    await expect(client.getState()).resolves.toBe("authorized");
    await expect(client.getSettings()).resolves.toEqual({
      incomingWebhook: "yes",
      webhookUrl: "",
    });
    await expect(client.getChats()).resolves.toEqual([
      { id: "123456", title: "Анна", phone: "79991234567" },
      { id: "-100001", title: "@group" },
      { id: "-100002", title: "Новости" },
    ]);
    await expect(client.getChatHistory("123456")).resolves.toEqual([
      {
        id: "old-incoming",
        chatId: "123456",
        text: "Привет",
        timestamp: 1763115110000,
        senderName: "Анна",
        direction: "incoming",
        status: "sent",
      },
      {
        id: "old-outgoing",
        chatId: "123456",
        text: "До встречи",
        timestamp: 1763115111000,
        senderName: "123456",
        direction: "outgoing",
        status: "delivered",
      },
      {
        id: "old-read",
        chatId: "123456",
        text: "Хорошо",
        timestamp: 1763115112000,
        senderName: "123456",
        direction: "outgoing",
        status: "read",
      },
    ]);
    await expect(client.resolvePhone("+7 (999) 123-45-67")).resolves.toEqual({
      chatId: "123456",
    });
    await expect(
      client.sendMessage("123456", " Привет!\nВторая строка "),
    ).resolves.toEqual({ idMessage: "sent-1" });
    await expect(client.receiveNotification()).resolves.toEqual({
      receiptId: 17,
      body: incoming,
    });
    await expect(client.deleteNotification(17)).resolves.toBe(true);
    await expect(client.receiveNotification()).resolves.toBeNull();
    const requests = fetchMock.mock.calls.map(([url, init]) => ({
      url,
      method: init?.method,
      body: init?.body,
    }));
    expect(requests).toEqual([
      {
        url: `${endpoint}/getStateInstance/test-token`,
        method: "GET",
        body: undefined,
      },
      {
        url: `${endpoint}/getSettings/test-token`,
        method: "GET",
        body: undefined,
      },
      {
        url: `${endpoint}/getChats/test-token`,
        method: "GET",
        body: undefined,
      },
      {
        url: `${endpoint}/getChatHistory/test-token`,
        method: "POST",
        body: JSON.stringify({ chatId: "123456", count: 100 }),
      },
      {
        url: `${endpoint}/checkAccount/test-token`,
        method: "POST",
        body: JSON.stringify({ phoneNumber: 79991234567 }),
      },
      {
        url: `${endpoint}/sendMessage/test-token`,
        method: "POST",
        body: JSON.stringify({
          chatId: "123456",
          message: " Привет!\nВторая строка ",
        }),
      },
      {
        url: `${endpoint}/receiveNotification/test-token?receiveTimeout=30`,
        method: "GET",
        body: undefined,
      },
      {
        url: `${endpoint}/deleteNotification/test-token/17`,
        method: "DELETE",
        body: undefined,
      },
      {
        url: `${endpoint}/receiveNotification/test-token?receiveTimeout=30`,
        method: "GET",
        body: undefined,
      },
    ]);
    expect(fetchMock.mock.calls[3]?.[1]?.headers).toEqual({
      "Content-Type": "application/json",
    });
  });

  it("отклоняет неверные параметры до отправки запроса", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      () =>
        new GreenApiTelegram({ ...credentials, apiUrl: "http://example.com" }),
    ).toThrow(GreenApiError);
    expect(
      () => new GreenApiTelegram({ ...credentials, apiTokenInstance: "" }),
    ).toThrow(GreenApiError);
    expect(normalizePhone("+7 (999) 123-45-67")).toBe("79991234567");
    const client = new GreenApiTelegram(credentials);
    await expect(client.resolvePhone("7abc9991234567")).rejects.toThrow(
      GreenApiError,
    );
    await expect(client.getChatHistory("invalid")).rejects.toThrow(
      GreenApiError,
    );
    await expect(client.sendMessage("123456", " \n ")).rejects.toThrow(
      GreenApiError,
    );
    await expect(
      client.sendMessage("123456", "я".repeat(MAX_MESSAGE_LENGTH + 1)),
    ).rejects.toThrow(GreenApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("показывает безопасные ошибки и не повторяет отправку после сетевого сбоя", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("Failed test-token private-message"))
      .mockResolvedValueOnce(
        new Response('{"error":"test-token private-message"}', { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new GreenApiTelegram(credentials);
    const sendError = await client
      .sendMessage("123456", "Привет")
      .catch((error: unknown) => error);
    expect(sendError).toBeInstanceOf(GreenApiError);
    expect((sendError as Error).message).not.toMatch(
      /test-token|private-message/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const accessError = await client
      .getState()
      .catch((error: unknown) => error);
    expect(accessError).toMatchObject({ status: 401 });
    expect((accessError as Error).message).not.toMatch(
      /test-token|private-message/,
    );
  });

  it("разбирает текст и статусы известных сообщений, пропуская другие уведомления", () => {
    expect(parseTextMessage(incoming)).toMatchObject({
      id: "reply-1",
      chatId: "123456",
      text: "Привет!",
      timestamp: 1763115112000,
      senderName: "Анна",
    });
    expect(
      parseTextMessage({
        ...incoming,
        messageData: {
          typeMessage: "extendedTextMessage",
          extendedTextMessageData: { text: "https://example.com" },
        },
      })?.text,
    ).toBe("https://example.com");
    expect(
      parseTextMessage({
        ...incoming,
        typeWebhook: "outgoingAPIMessageReceived",
      }),
    ).toBeNull();
    expect(
      parseTextMessage({
        ...incoming,
        messageData: { typeMessage: "imageMessage" },
      }),
    ).toBeNull();
    expect(parseTextMessage(null)).toBeNull();
    const notification = {
      typeWebhook: "outgoingMessageStatus",
      chatId: "123456",
      idMessage: "sent-1",
    };
    for (const status of ["sent", "delivered", "read"]) {
      expect(parseOutgoingStatus({ ...notification, status })).toEqual({
        chatId: "123456",
        messageId: "sent-1",
        status,
      });
    }
    for (const status of ["failed", "noAccount"]) {
      const failure = parseOutgoingStatus({
        ...notification,
        status,
        description: "private test-token",
      });
      expect(failure).toMatchObject({
        chatId: "123456",
        messageId: "sent-1",
        status: "failed",
      });
      expect(failure?.error).toBeTruthy();
      expect(failure?.error).not.toMatch(/private|test-token/);
    }
    expect(
      parseOutgoingStatus({ ...notification, status: "unknown" }),
    ).toBeNull();
    expect(
      parseOutgoingStatus({
        ...notification,
        status: "failed",
        idMessage: undefined,
      }),
    ).toBeNull();
    expect(
      parseOutgoingStatus({
        ...notification,
        status: "read",
        chatId: "invalid",
      }),
    ).toBeNull();
  });
});
