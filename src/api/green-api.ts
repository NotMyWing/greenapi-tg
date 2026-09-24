import type { Credentials, InstanceSettings, Notification, ResolvedChat, SentMessage } from './utils/types.js';
import { NOTIFICATION_REQUEST_TIMEOUT_MS, RECEIVE_TIMEOUT_SECONDS, request } from './utils/request.js';
import {
  normalizeCredentials,
  normalizePhone,
  parseDeletionResult,
  parseNotification,
  parseResolvedChat,
  parseSentMessage,
  parseSettings,
  parseState,
  validateMessage,
  validateReceiptId,
} from './utils/validation.js';

/**
 * Клиент GREEN-API Telegram для отправки и получения текста.
 *
 * Сетевые методы принимают AbortSignal и не повторяют запросы.
 * Ошибки API, сети и данных имеют тип GreenApiError; отмена даёт AbortError.
 * Обычный запрос ограничен 20 секундами, получение уведомления — 40 секундами.
 */
export class GreenApiTelegram {
  readonly #credentials: Credentials;

  /**
   * Проверяет и сохраняет копию параметров подключения.
   * @param credentials Адрес HTTPS, ID и токен инстанса из кабинета GREEN-API.
   * @throws GreenApiError, если параметры подключения неверны.
   */
  constructor(credentials: Credentials) {
    this.#credentials = normalizeCredentials(credentials);
  }

  /**
   * Возвращает состояние инстанса, например `authorized` или `notAuthorized`.
   * @param signal Сигнал отмены запроса.
   */
  async getState(signal?: AbortSignal): Promise<string> {
    return parseState(await request(this.#credentials, 'getStateInstance', { signal }));
  }

  /**
   * Читает настройки получения уведомлений.
   * Для HTTP-опроса нужны incomingWebhook: "yes" и пустой webhookUrl.
   * @param signal Сигнал отмены запроса.
   * @throws GreenApiError, если инстанс относится к другому мессенджеру.
   */
  async getSettings(signal?: AbortSignal): Promise<InstanceSettings> {
    return parseSettings(await request(this.#credentials, 'getSettings', { signal }));
  }

  /**
   * Находит ID чата Telegram по номеру телефона через CheckAccount.
   * @param phone Номер с кодом страны; допускаются пробелы, скобки и дефисы.
   * @param signal Сигнал отмены запроса.
   * @throws GreenApiError, если аккаунт не найден или поиск закрыт настройками приватности.
   */
  async resolvePhone(phone: string, signal?: AbortSignal): Promise<ResolvedChat> {
    const data = await request(this.#credentials, 'checkAccount', {
      verb: 'POST',
      body: { phoneNumber: Number(normalizePhone(phone)) },
      signal,
    });
    return parseResolvedChat(data);
  }

  /**
   * Ставит текст в очередь отправки без изменения пробелов и переносов.
   * @param chatId Числовой ID чата Telegram в виде строки.
   * @param message Непустой текст до 4096 символов.
   * @param signal Сигнал отмены запроса.
   * @returns ID принятого сообщения; ответ не подтверждает доставку.
   */
  async sendMessage(chatId: string, message: string, signal?: AbortSignal): Promise<SentMessage> {
    validateMessage(chatId, message);
    const data = await request(this.#credentials, 'sendMessage', {
      verb: 'POST', body: { chatId, message }, signal,
    });
    return parseSentMessage(data);
  }

  /**
   * Ждёт следующее уведомление до 30 секунд; пустая очередь даёт null.
   * После обработки вызовите deleteNotification, иначе событие придёт снова.
   * @param signal Сигнал отмены запроса.
   * @returns Уведомление с исходным телом любого типа или null.
   */
  async receiveNotification(signal?: AbortSignal): Promise<Notification | null> {
    const data = await request(this.#credentials, 'receiveNotification', {
      suffix: `?receiveTimeout=${RECEIVE_TIMEOUT_SECONDS}`,
      timeout: NOTIFICATION_REQUEST_TIMEOUT_MS,
      signal,
    });
    return parseNotification(data);
  }

  /**
   * Подтверждает обработку уведомления и удаляет его из очереди.
   * @param receiptId ID доставки из receiveNotification, а не ID сообщения.
   * @param signal Сигнал отмены запроса.
   * @returns true при удалении; false, если событие уже удалено или ID не совпал.
   */
  async deleteNotification(receiptId: number, signal?: AbortSignal): Promise<boolean> {
    validateReceiptId(receiptId);
    const data = await request(this.#credentials, 'deleteNotification', {
      verb: 'DELETE', suffix: `/${receiptId}`, signal,
    });
    return parseDeletionResult(data);
  }
}
