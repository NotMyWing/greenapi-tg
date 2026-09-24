/** Ошибка GREEN-API с безопасным сообщением и HTTP-статусом, если он известен. */
export class GreenApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'GreenApiError';
    this.status = status;
  }
}

export function invalidResponse(): GreenApiError {
  return new GreenApiError('GREEN-API вернул неожиданный ответ.');
}

export function safeApiError(status: number, response: string): GreenApiError {
  const detail = response.toLowerCase();
  let message: string;

  if (status === 401 || status === 403) {
    message = 'Доступ запрещён. Проверьте idInstance, apiTokenInstance и apiUrl.';
  } else if (detail.includes('webhook url is set')) {
    message = 'Очистите webhookUrl в настройках инстанса и подождите около минуты.';
  } else if (detail.includes('not authorized') || detail.includes('starting')) {
    message = 'Инстанс запускается или не авторизован. Проверьте его в личном кабинете GREEN-API.';
  } else if (detail.includes('expired')) {
    message = 'Срок действия инстанса истёк. Проверьте тариф в личном кабинете GREEN-API.';
  } else if (detail.includes('rate_limit') || status === 469) {
    message = 'Telegram временно ограничил поиск номеров. Попробуйте через несколько часов.';
  } else if (status === 429) {
    message = 'Слишком много запросов. Подождите немного и повторите попытку.';
  } else if (status >= 500) {
    message = 'GREEN-API временно недоступен. Попробуйте позже.';
  } else if (status === 404) {
    message = 'Инстанс не найден. Проверьте apiUrl и idInstance.';
  } else {
    message = 'GREEN-API отклонил запрос. Проверьте данные и состояние инстанса.';
  }

  // Тело ошибки может содержать токен: показываем только известные сообщения.
  return new GreenApiError(message, status || undefined);
}
