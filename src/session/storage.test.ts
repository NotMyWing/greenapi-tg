// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearSession, readSession, saveSession, SESSION_STORAGE_KEY } from './storage.js';

const credentials = {
  apiUrl: 'https://4100.api.green-api.com',
  idInstance: '4100000000',
  apiTokenInstance: 'test-token',
};

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe('хранение подключения', () => {
  it('возвращает null при отсутствии записи', () => {
    expect(readSession()).toBeNull();
  });

  it('сохраняет и восстанавливает только нормализованные параметры', () => {
    const input = {
      apiUrl: ` ${credentials.apiUrl}/ `,
      idInstance: ` ${credentials.idInstance} `,
      apiTokenInstance: ` ${credentials.apiTokenInstance} `,
      settings: { incomingWebhook: 'yes' },
    };
    expect(saveSession(input)).toBe(true);
    expect(readSession()).toEqual(credentials);
    expect(JSON.parse(window.sessionStorage.getItem(SESSION_STORAGE_KEY)!)).toEqual(credentials);
  });

  it('повторно проверяет и нормализует данные при чтении', () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
      apiUrl: `${credentials.apiUrl}/`,
      idInstance: ` ${credentials.idInstance} `,
      apiTokenInstance: ` ${credentials.apiTokenInstance} `,
      unrelated: true,
    }));
    expect(readSession()).toEqual(credentials);
  });

  it.each([
    '{broken', 'null', '[]', '{}',
    JSON.stringify({ ...credentials, idInstance: 4100000000 }),
    JSON.stringify({ ...credentials, apiUrl: 'http://4100.api.green-api.com' }),
    JSON.stringify({ ...credentials, apiTokenInstance: '' }),
  ])('удаляет повреждённую запись, сохраняя чужие данные %#', (stored) => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, stored);
    window.sessionStorage.setItem('unrelated', 'keep');
    expect(readSession()).toBeNull();
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep');
  });

  it('не записывает непроверенные параметры', () => {
    expect(saveSession({ ...credentials, idInstance: 'invalid' })).toBe(false);
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('удаляет только запись подключения', () => {
    saveSession(credentials);
    window.sessionStorage.setItem('unrelated', 'keep');
    expect(clearSession()).toBe(true);
    expect(readSession()).toBeNull();
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep');
    expect(clearSession()).toBe(true);
  });

  it('безопасно обрабатывает запрет доступа к хранилищу', () => {
    vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    expect(readSession()).toBeNull();
    expect(saveSession(credentials)).toBe(false);
    expect(clearSession()).toBe(false);
  });

  it('безопасно обрабатывает ошибку чтения', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    expect(readSession()).toBeNull();
  });

  it('возвращает false при нехватке места', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    expect(saveSession(credentials)).toBe(false);
  });

  it('не выбрасывает ошибку при невозможности удалить повреждённую запись', () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, '{broken');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });
    expect(readSession()).toBeNull();
    expect(clearSession()).toBe(false);
  });
});
