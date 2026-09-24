export interface Credentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

export interface InstanceSettings {
  incomingWebhook: "yes" | "no";
  webhookUrl: string;
}

export interface IncomingTextMessage {
  id: string;
  chatId: string;
  text: string;
  timestamp: number;
  senderName: string;
}

export interface TelegramChat {
  id: string;
  title: string;
  phone?: string;
}

export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";

export interface OutgoingMessageStatus {
  chatId: string;
  messageId: string;
  status: Exclude<MessageStatus, "queued">;
  error?: string;
}

export interface HistoryMessage extends IncomingTextMessage {
  direction: "incoming" | "outgoing";
  status: MessageStatus;
}

export interface Notification {
  receiptId: number;
  body: unknown;
}

export const MAX_MESSAGE_LENGTH = 4096;
export const DEFAULT_API_URL = "https://api.green-api.com";

export class GreenApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GreenApiError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof GreenApiError
    ? error.message
    : "Не удалось выполнить запрос. Повторите попытку.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function invalidResponse(): GreenApiError {
  return new GreenApiError(
    "GREEN-API вернул неожиданный ответ. Повторите попытку.",
  );
}

// Показываем свои тексты ошибок: ответ API может содержать токен.
function apiError(status: number, response: string): GreenApiError {
  const detail = response.toLowerCase();
  let message =
    "GREEN-API отклонил запрос. Проверьте данные и состояние инстанса.";
  if (status === 401 || status === 403)
    message =
      "Доступ запрещён. Проверьте idInstance, apiTokenInstance и apiUrl.";
  else if (status === 429)
    message = "Слишком много запросов. Подождите немного и повторите попытку.";
  else if (status === 469 || detail.includes("rate_limit"))
    message =
      "Telegram временно ограничил поиск номеров. Попробуйте через несколько часов.";
  else if (detail.includes("webhook url is set"))
    message =
      "Очистите webhookUrl в настройках инстанса и подождите около минуты.";
  else if (detail.includes("not authorized") || detail.includes("starting"))
    message =
      "Авторизуйте инстанс Telegram в кабинете GREEN-API и повторите вход.";
  else if (status === 404)
    message = "Инстанс не найден. Проверьте apiUrl и idInstance.";
  else if (status >= 500)
    message = "GREEN-API временно недоступен. Попробуйте позже.";
  return new GreenApiError(message, status || undefined);
}

export function normalizePhone(value: string): string {
  const input = value.trim();
  const phone = input.replace(/[\s().-]/g, "").replace(/^\+/, "");
  if (!/^\+?[\d\s().-]+$/.test(input) || !/^[1-9]\d{6,14}$/.test(phone)) {
    throw new GreenApiError(
      "Введите номер с кодом страны: от 7 до 15 цифр, например +7 999 123-45-67.",
    );
  }
  return phone;
}

function normalizeCredentials(credentials: Credentials): Credentials {
  let url: URL;
  try {
    url = new URL(credentials.apiUrl.trim() || DEFAULT_API_URL);
  } catch {
    throw new GreenApiError(
      "Укажите apiUrl из личного кабинета GREEN-API, начиная с https://.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new GreenApiError(
      "apiUrl должен содержать только HTTPS-адрес сервера из личного кабинета.",
    );
  }
  const idInstance = credentials.idInstance.trim();
  const apiTokenInstance = credentials.apiTokenInstance.trim();
  if (!/^\d+$/.test(idInstance))
    throw new GreenApiError("idInstance должен содержать только цифры.");
  if (!/^[\w-]+$/.test(apiTokenInstance))
    throw new GreenApiError(
      "Укажите корректный apiTokenInstance из личного кабинета.",
    );
  return { apiUrl: url.origin, idInstance, apiTokenInstance };
}

export class GreenApiTelegram {
  readonly #credentials: Credentials;

  constructor(credentials: Credentials) {
    this.#credentials = normalizeCredentials(credentials);
  }

  async #request(
    method: string,
    signal?: AbortSignal,
    body?: Record<string, unknown>,
    suffix = "",
    timeout = 20_000,
    verb = body ? "POST" : "GET",
  ): Promise<unknown> {
    const { apiUrl, idInstance, apiTokenInstance } = this.#credentials;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.throwIfAborted();
    signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeout);
    try {
      const response = await fetch(
        `${apiUrl}/waInstance${idInstance}/${method}/${apiTokenInstance}${suffix}`,
        {
          method: verb,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
          credentials: "omit",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          redirect: "error",
        },
      );
      const text = await response.text();
      signal?.throwIfAborted();
      if (!response.ok) throw apiError(response.status, text);
      if (!text.trim()) return null;
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw invalidResponse();
      }
      if (isRecord(data) && data.status === false) throw apiError(0, text);
      return data;
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof GreenApiError) throw error;
      // Считаем конец ожидания пустым ответом. Цикл опроса начнёт новый запрос.
      if (method === "receiveNotification" && controller.signal.aborted)
        return null;
      const message = controller.signal.aborted
        ? "GREEN-API не ответил вовремя."
        : "Не удалось связаться с GREEN-API. Проверьте интернет и apiUrl.";
      throw new GreenApiError(
        message +
          (method === "sendMessage"
            ? " Перед повтором проверьте чат в Telegram: сообщение могло быть отправлено."
            : " Попробуйте ещё раз."),
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }

  async getState(signal?: AbortSignal): Promise<string> {
    const data = await this.#request(
      "getStateInstance",
      signal,
      undefined,
      "",
      5_000,
    );
    if (!isRecord(data) || !isText(data.stateInstance)) throw invalidResponse();
    return data.stateInstance;
  }

  async getSettings(signal?: AbortSignal): Promise<InstanceSettings> {
    const data = await this.#request("getSettings", signal);
    if (
      !isRecord(data) ||
      typeof data.webhookUrl !== "string" ||
      (data.incomingWebhook !== "yes" && data.incomingWebhook !== "no")
    )
      throw invalidResponse();
    if (data.typeInstance !== undefined && data.typeInstance !== "telegram")
      throw new GreenApiError(
        "Выберите инстанс Telegram в личном кабинете GREEN-API.",
      );
    return {
      incomingWebhook: data.incomingWebhook,
      webhookUrl: data.webhookUrl,
    };
  }

  async getChats(signal?: AbortSignal): Promise<TelegramChat[]> {
    const data = await this.#request("getChats", signal);
    if (!Array.isArray(data)) throw invalidResponse();
    return data.map((chat: unknown) => {
      if (
        !isRecord(chat) ||
        !isText(chat.chatId) ||
        !/^-?[1-9]\d*$/.test(chat.chatId)
      )
        throw invalidResponse();
      const name = typeof chat.name === "string" ? chat.name.trim() : "";
      const username =
        typeof chat.username === "string" ? chat.username.trim() : "";
      const phone = chat.phoneNumber;
      return {
        id: chat.chatId,
        title: name || username || chat.chatId,
        ...(typeof phone === "number" &&
        Number.isSafeInteger(phone) &&
        phone > 0
          ? { phone: String(phone) }
          : {}),
      };
    });
  }

  /** Берём текст из последних 100 записей, от старых к новым. */
  async getChatHistory(
    chatId: string,
    signal?: AbortSignal,
  ): Promise<HistoryMessage[]> {
    if (!/^-?[1-9]\d*$/.test(chatId))
      throw new GreenApiError("Некорректный идентификатор чата Telegram.");
    const data = await this.#request("getChatHistory", signal, {
      chatId,
      count: 100,
    });
    if (!Array.isArray(data)) throw invalidResponse();
    const messages: HistoryMessage[] = [];
    for (const item of data) {
      if (!isRecord(item)) throw invalidResponse();
      if (item.isDeleted === true || item.typeMessage !== "textMessage")
        continue;
      if (
        (item.type !== "incoming" && item.type !== "outgoing") ||
        !isText(item.idMessage) ||
        item.chatId !== chatId ||
        !isText(item.textMessage) ||
        typeof item.timestamp !== "number" ||
        !Number.isSafeInteger(item.timestamp) ||
        item.timestamp < 0 ||
        item.timestamp > 8_640_000_000_000
      )
        throw invalidResponse();
      messages.push({
        id: item.idMessage,
        chatId,
        text: item.textMessage,
        timestamp: item.timestamp * 1000,
        senderName: isText(item.senderName) ? item.senderName : chatId,
        direction: item.type,
        status:
          item.statusMessage === "queued" ||
          item.statusMessage === "failed" ||
          item.statusMessage === "delivered" ||
          item.statusMessage === "read"
            ? item.statusMessage
            : "sent",
      });
    }
    return messages.sort((first, second) => first.timestamp - second.timestamp);
  }

  async resolvePhone(
    phone: string,
    signal?: AbortSignal,
  ): Promise<{ chatId: string }> {
    const data = await this.#request("checkAccount", signal, {
      phoneNumber: Number(normalizePhone(phone)),
    });
    if (!isRecord(data) || typeof data.exist !== "boolean")
      throw invalidResponse();
    if (!data.exist)
      throw new GreenApiError(
        "Аккаунт Telegram не найден или поиск по номеру ограничен настройками приватности.",
      );
    if (typeof data.chatId !== "string" || !/^[1-9]\d*$/.test(data.chatId))
      throw invalidResponse();
    return { chatId: data.chatId };
  }

  /** Возвращаем ID сообщения, которое API принял в очередь. */
  async sendMessage(
    chatId: string,
    message: string,
    signal?: AbortSignal,
  ): Promise<{ idMessage: string }> {
    if (!/^-?[1-9]\d*$/.test(chatId))
      throw new GreenApiError("Некорректный идентификатор чата Telegram.");
    if (!message.trim()) throw new GreenApiError("Введите текст сообщения.");
    if (message.length > MAX_MESSAGE_LENGTH)
      throw new GreenApiError(
        "Сообщение должно содержать не более 4096 символов.",
      );
    const data = await this.#request("sendMessage", signal, {
      chatId,
      message,
    });
    if (!isRecord(data) || !isText(data.idMessage)) throw invalidResponse();
    return { idMessage: data.idMessage };
  }

  async receiveNotification(
    signal?: AbortSignal,
  ): Promise<Notification | null> {
    const data = await this.#request(
      "receiveNotification",
      signal,
      undefined,
      "?receiveTimeout=30",
      40_000,
    );
    if (data === null) return null;
    if (
      !isRecord(data) ||
      typeof data.receiptId !== "number" ||
      !Number.isSafeInteger(data.receiptId) ||
      data.receiptId < 0 ||
      !("body" in data)
    )
      throw invalidResponse();
    return { receiptId: data.receiptId, body: data.body };
  }

  async deleteNotification(
    receiptId: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (!Number.isSafeInteger(receiptId) || receiptId < 0)
      throw new GreenApiError("Некорректный идентификатор уведомления.");
    const data = await this.#request(
      "deleteNotification",
      signal,
      undefined,
      `/${receiptId}`,
      20_000,
      "DELETE",
    );
    if (!isRecord(data) || typeof data.result !== "boolean")
      throw invalidResponse();
    return data.result;
  }
}

/** Извлекаем текст и данные автора из входящего уведомления. */
export function parseTextMessage(body: unknown): IncomingTextMessage | null {
  if (
    !isRecord(body) ||
    body.typeWebhook !== "incomingMessageReceived" ||
    !isRecord(body.senderData) ||
    !isRecord(body.messageData)
  )
    return null;
  const { senderData, messageData } = body;
  if (
    !isText(body.idMessage) ||
    !isText(senderData.chatId) ||
    !/^-?[1-9]\d*$/.test(senderData.chatId) ||
    typeof body.timestamp !== "number" ||
    !Number.isFinite(body.timestamp) ||
    body.timestamp < 0 ||
    body.timestamp > 8_640_000_000_000
  )
    return null;
  let text: unknown;
  if (
    messageData.typeMessage === "textMessage" &&
    isRecord(messageData.textMessageData)
  )
    text = messageData.textMessageData.textMessage;
  if (
    messageData.typeMessage === "extendedTextMessage" &&
    isRecord(messageData.extendedTextMessageData)
  )
    text = messageData.extendedTextMessageData.text;
  if (!isText(text)) return null;
  return {
    id: body.idMessage,
    chatId: senderData.chatId,
    text,
    timestamp: body.timestamp * 1000,
    senderName: isText(senderData.senderName)
      ? senderData.senderName
      : senderData.chatId,
  };
}

export function parseOutgoingStatus(
  body: unknown,
): OutgoingMessageStatus | null {
  if (
    !isRecord(body) ||
    body.typeWebhook !== "outgoingMessageStatus" ||
    !isText(body.chatId) ||
    !/^-?[1-9]\d*$/.test(body.chatId) ||
    !isText(body.idMessage)
  )
    return null;
  const status = body.status === "noAccount" ? "failed" : body.status;
  if (
    status !== "sent" &&
    status !== "delivered" &&
    status !== "read" &&
    status !== "failed"
  )
    return null;
  return {
    chatId: body.chatId,
    messageId: body.idMessage,
    status,
    ...(status === "failed"
      ? {
          error:
            "Telegram не смог отправить сообщение. Проверьте чат перед повторной отправкой.",
        }
      : {}),
  };
}
