import { afterEach, describe, expect, it, vi } from 'vitest';
import { GreenApiError, GreenApiTelegram, MAX_MESSAGE_LENGTH, normalizePhone, parseTextMessage } from '../index.js';

const credentials = {
  apiUrl: 'https://4100.api.green-api.com/',
  idInstance: '4100000000',
  apiTokenInstance: 'test-token',
};
const client = () => new GreenApiTelegram(credentials);

function mockResponse(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function textNotification() {
  return {
    typeWebhook: 'incomingMessageReceived',
    timestamp: 1763115112,
    idMessage: '1763115112345',
    senderData: { chatId: '10000000', senderName: 'Анна' },
    messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 'Привет!' } },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('normalizePhone', () => {
  it('убирает форматирование, сохраняя код страны', () => {
    expect(normalizePhone(' +7 (999) 123-45-67 ')).toBe('79991234567');
    expect(normalizePhone('1 202 555 0198')).toBe('12025550198');
    expect(normalizePhone('+123456789012345')).toBe('123456789012345');
  });

  it.each(['', '123', '+0123456789', '+1234567890123456', '7abc9991234567', '7+9991234567', '79991234567@c.us'])(
    'отклоняет неверный номер: %s',
    (phone) => expect(() => normalizePhone(phone)).toThrow(GreenApiError),
  );
});

describe('GreenApiTelegram', () => {
  it('проверяет параметры до запроса', () => {
    for (const apiUrl of ['invalid', 'http://4100.api.green-api.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?token=1']) {
      expect(() => new GreenApiTelegram({ ...credentials, apiUrl })).toThrow(GreenApiError);
    }
    expect(() => new GreenApiTelegram({ ...credentials, idInstance: '1/2' })).toThrow(GreenApiError);
    expect(() => new GreenApiTelegram({ ...credentials, apiTokenInstance: '' })).toThrow(GreenApiError);
  });

  it('получает состояние инстанса по документированному адресу', async () => {
    const fetchMock = mockResponse({ stateInstance: 'authorized' });
    await expect(client().getState()).resolves.toBe('authorized');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance4100000000/getStateInstance/test-token',
      expect.objectContaining({ method: 'GET', credentials: 'omit', cache: 'no-store', redirect: 'error' }),
    );
  });

  it('возвращает настройки получения уведомлений без их изменения', async () => {
    const fetchMock = mockResponse({ typeInstance: 'telegram', incomingWebhook: 'yes', webhookUrl: '' });
    await expect(client().getSettings()).resolves.toEqual({ incomingWebhook: 'yes', webhookUrl: '' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET');
  });

  it('отклоняет инстанс другого мессенджера', async () => {
    mockResponse({ typeInstance: 'whatsapp', incomingWebhook: 'yes', webhookUrl: '' });
    await expect(client().getSettings()).rejects.toThrow('Выберите инстанс Telegram');
  });

  it('получает настоящий Telegram chatId по номеру', async () => {
    const fetchMock = mockResponse({ exist: true, chatId: '10000000' });
    await expect(client().resolvePhone('+7 (999) 123-45-67')).resolves.toEqual({ chatId: '10000000' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance4100000000/checkAccount/test-token',
      expect.objectContaining({
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: 79991234567 }),
      }),
    );
  });

  it('объясняет отсутствие аккаунта или ограничения приватности', async () => {
    mockResponse({ exist: false, chatId: '' });
    await expect(client().resolvePhone('79991234567')).rejects.toThrow('настройками приватности');
  });

  it('обрабатывает ошибку Telegram при HTTP 200', async () => {
    mockResponse({ status: false, data: { reason: 'rate_limit_exceeded', retryAfter: 11930619 } });
    await expect(client().resolvePhone('79991234567')).rejects.toThrow('временно ограничил поиск номеров');
  });

  it('отправляет текст без изменения пробелов и переносов', async () => {
    const fetchMock = mockResponse({ idMessage: '1769676078000' });
    const message = ' Привет!\nВторая строка ';
    await expect(client().sendMessage('10000000', message)).resolves.toEqual({ idMessage: '1769676078000' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance4100000000/sendMessage/test-token',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ chatId: '10000000', message }) }),
    );
  });

  it('не отправляет пустой или слишком длинный текст', async () => {
    const fetchMock = mockResponse({ idMessage: '1' });
    await expect(client().sendMessage('10000000', ' \n ')).rejects.toThrow('Введите текст');
    await expect(client().sendMessage('10000000', 'я'.repeat(MAX_MESSAGE_LENGTH + 1))).rejects.toThrow('4096');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('получает уведомление с таймаутом длительного опроса', async () => {
    const notification = { receiptId: 1234567, body: textNotification() };
    const fetchMock = mockResponse(notification);
    await expect(client().receiveNotification()).resolves.toEqual(notification);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance4100000000/receiveNotification/test-token?receiveTimeout=30',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('считает null и пустой ответ пустой очередью', async () => {
    const fetchMock = mockResponse(null);
    fetchMock.mockResolvedValueOnce(new Response(''));
    await expect(client().receiveNotification()).resolves.toBeNull();
    await expect(client().receiveNotification()).resolves.toBeNull();
  });

  it('сохраняет неизвестное тело уведомления для его подтверждения', async () => {
    mockResponse({ receiptId: 7, body: null });
    await expect(client().receiveNotification()).resolves.toEqual({ receiptId: 7, body: null });
  });

  it.each([true, false])('возвращает результат удаления %s без его подмены', async (result) => {
    const fetchMock = mockResponse({ result, reason: '' });
    await expect(client().deleteNotification(1234567)).resolves.toBe(result);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://4100.api.green-api.com/waInstance4100000000/deleteNotification/test-token/1234567',
      expect.objectContaining({ method: 'DELETE', body: undefined }),
    );
  });

  it('не доверяет повреждённым ответам API', async () => {
    const fetchMock = mockResponse({});
    await expect(client().getState()).rejects.toThrow('неожиданный ответ');
    fetchMock.mockResolvedValueOnce(new Response('{broken'));
    await expect(client().receiveNotification()).rejects.toThrow('неожиданный ответ');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ receiptId: '7', body: {} })));
    await expect(client().receiveNotification()).rejects.toThrow('неожиданный ответ');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ exist: true, chatId: '79991234567@c.us' })));
    await expect(client().resolvePhone('79991234567')).rejects.toThrow('неожиданный ответ');
  });

  it('не раскрывает тело ошибки с секретами', async () => {
    mockResponse({ error: `URL includes ${credentials.apiTokenInstance}` }, 401);
    const error = await client().getState().catch((value: unknown) => value);
    expect(error).toBeInstanceOf(GreenApiError);
    expect(error).toMatchObject({ status: 401 });
    expect((error as Error).message).not.toContain(credentials.apiTokenInstance);
  });

  it('объясняет несовместимость webhookUrl и HTTP-опроса', async () => {
    mockResponse({ error: 'Message cannot be received because custom webhook url is set.' }, 400);
    await expect(client().receiveNotification()).rejects.toThrow('Очистите webhookUrl');
  });

  it('не повторяет запрос отправки после потери соединения', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError(`Failed ${credentials.apiTokenInstance}`));
    vi.stubGlobal('fetch', fetchMock);
    const error = await client().sendMessage('10000000', 'Привет').catch((value: unknown) => value);
    expect((error as Error).message).toContain('сообщение могло быть отправлено');
    expect((error as Error).message).not.toContain(credentials.apiTokenInstance);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('не начинает запрос с отменённым сигналом', async () => {
    const fetchMock = mockResponse(null);
    const controller = new AbortController();
    controller.abort();
    await expect(client().receiveNotification(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('отменяет выполняющийся запрос по сигналу вызывающего кода', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const pending = client().receiveNotification(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('ограничивает длительность зависшего запроса', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const pending = expect(client().getState()).rejects.toThrow('не ответил вовремя');
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('parseTextMessage', () => {
  it('преобразует секунды в миллисекунды и сохраняет идентификатор чата', () => {
    expect(parseTextMessage(textNotification())).toEqual({
      id: '1763115112345', chatId: '10000000', text: 'Привет!',
      timestamp: 1763115112000, direction: 'incoming', senderName: 'Анна',
    });
  });

  it.each(['outgoingMessageReceived', 'outgoingAPIMessageReceived'])(
    'распознаёт исходящее событие %s',
    (typeWebhook) => expect(parseTextMessage({ ...textNotification(), typeWebhook })?.direction).toBe('outgoing'),
  );

  it('читает расширенный текст с URL', () => {
    expect(parseTextMessage({
      ...textNotification(),
      messageData: { typeMessage: 'extendedTextMessage', extendedTextMessageData: { text: 'https://example.com' } },
    })?.text).toBe('https://example.com');
  });

  it.each([
    null, undefined, [], 'text', {},
    { ...textNotification(), typeWebhook: 'outgoingMessageStatus' },
    { ...textNotification(), senderData: null },
    { ...textNotification(), senderData: { chatId: '79991234567@c.us' } },
    { ...textNotification(), timestamp: Number.NaN },
    { ...textNotification(), timestamp: -1 },
    { ...textNotification(), idMessage: null },
    { ...textNotification(), messageData: { typeMessage: 'imageMessage' } },
    { ...textNotification(), messageData: { typeMessage: 'textMessage', textMessageData: { textMessage: 123 } } },
  ])('пропускает неизвестное или повреждённое событие %#', (body) => {
    expect(parseTextMessage(body)).toBeNull();
  });
});
