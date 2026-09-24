// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { GreenApiError, GreenApiTelegram } from './index';
import { readSession, saveSession, SESSION_STORAGE_KEY } from './session/storage';

const savedCredentials = {
  apiUrl: 'https://4100.api.green-api.com',
  idInstance: '4100000000',
  apiTokenInstance: 'test-token',
};

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(GreenApiTelegram.prototype, 'getState').mockResolvedValue('authorized');
  vi.spyOn(GreenApiTelegram.prototype, 'getSettings').mockResolvedValue({ incomingWebhook: 'yes', webhookUrl: '' });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});

async function fillCredentials() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Адрес API'), 'https://4100.api.green-api.com');
  await user.type(screen.getByLabelText('ID инстанса'), '4100000000');
  await user.type(screen.getByLabelText('Токен API'), 'test-token');
  return user;
}

describe('Подключение React к клиенту', () => {
  it('проверяет инстанс, показывает статус и очищает форму после отключения', async () => {
    render(<StrictMode><App /></StrictMode>);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));

    expect(await screen.findByRole('heading', { name: 'Инстанс подключён' })).toBeTruthy();
    expect(screen.getByText('4100000000')).toBeTruthy();
    expect(screen.getByText('Настроен')).toBeTruthy();
    expect(GreenApiTelegram.prototype.getState).toHaveBeenCalledTimes(1);
    expect(GreenApiTelegram.prototype.getSettings).toHaveBeenCalledTimes(1);
    expect(readSession()).toEqual(savedCredentials);

    await user.click(screen.getByRole('button', { name: 'Отключиться' }));
    expect((screen.getByLabelText('Токен API') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('ID инстанса') as HTMLInputElement).value).toBe('');
    expect(readSession()).toBeNull();
  });

  it('оставляет форму доступной после отказа API', async () => {
    vi.mocked(GreenApiTelegram.prototype.getState).mockRejectedValueOnce(new GreenApiError('Доступ запрещён.', 401));
    render(<App />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Доступ запрещён');
    expect((screen.getByRole('button', { name: 'Подключиться' }) as HTMLButtonElement).disabled).toBe(false);
    expect(GreenApiTelegram.prototype.getSettings).not.toHaveBeenCalled();
  });

  it('не подключает неавторизованный инстанс', async () => {
    vi.mocked(GreenApiTelegram.prototype.getState).mockResolvedValueOnce('notAuthorized');
    render(<App />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Авторизуйте инстанс');
    expect(GreenApiTelegram.prototype.getSettings).not.toHaveBeenCalled();
  });

  it('показывает настройку уведомлений при заданном webhook', async () => {
    vi.mocked(GreenApiTelegram.prototype.getSettings).mockResolvedValueOnce({ incomingWebhook: 'yes', webhookUrl: 'https://example.com/hook' });
    render(<App />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));

    expect(await screen.findByText('Нужна настройка')).toBeTruthy();
    expect(screen.getByText(/очистите адрес webhook/)).toBeTruthy();
  });

  it('отменяет запрос и игнорирует ответ, который пришёл после отмены', async () => {
    let finish!: (state: string) => void;
    vi.mocked(GreenApiTelegram.prototype.getState).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(<App />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));

    const signal = vi.mocked(GreenApiTelegram.prototype.getState).mock.calls[0]?.[0];
    expect((screen.getByRole('button', { name: 'Проверяем подключение…' }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => { finish('authorized'); });

    expect(screen.queryByRole('heading', { name: 'Инстанс подключён' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(GreenApiTelegram.prototype.getSettings).not.toHaveBeenCalled();
  });

  it('отменяет запрос при удалении формы', async () => {
    vi.mocked(GreenApiTelegram.prototype.getState).mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Запрос отменён.', 'AbortError')), { once: true });
    }));
    const view = render(<App />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));
    const signal = vi.mocked(GreenApiTelegram.prototype.getState).mock.calls[0]?.[0];

    view.unmount();
    expect(signal?.aborted).toBe(true);
  });

  it('восстанавливает подключение после перезагрузки и заново проверяет API', async () => {
    const firstPage = render(<App />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));
    await screen.findByRole('heading', { name: 'Инстанс подключён' });
    firstPage.unmount();

    vi.mocked(GreenApiTelegram.prototype.getState).mockClear();
    vi.mocked(GreenApiTelegram.prototype.getSettings).mockClear();
    await act(async () => { render(<StrictMode><App /></StrictMode>); });
    expect(await screen.findByRole('heading', { name: 'Инстанс подключён' })).toBeTruthy();
    expect(GreenApiTelegram.prototype.getState).toHaveBeenCalled();
    expect(GreenApiTelegram.prototype.getSettings).toHaveBeenCalledTimes(1);
    expect(readSession()).toEqual(savedCredentials);
  });

  it('не восстанавливает подключение после выхода и перезагрузки', async () => {
    saveSession(savedCredentials);
    let firstPage!: ReturnType<typeof render>;
    await act(async () => { firstPage = render(<App />); });
    await screen.findByRole('heading', { name: 'Инстанс подключён' });
    await userEvent.click(screen.getByRole('button', { name: 'Отключиться' }));
    firstPage.unmount();
    vi.mocked(GreenApiTelegram.prototype.getState).mockClear();

    render(<App />);
    expect(screen.getByRole('heading', { name: 'Подключите Telegram' })).toBeTruthy();
    expect(GreenApiTelegram.prototype.getState).not.toHaveBeenCalled();
    expect(readSession()).toBeNull();
  });

  it('удаляет сохранённый токен, если API отклонил его', async () => {
    saveSession(savedCredentials);
    vi.mocked(GreenApiTelegram.prototype.getState).mockRejectedValueOnce(new GreenApiError('Доступ запрещён.', 401));
    await act(async () => { render(<App />); });

    expect((await screen.findByRole('alert')).textContent).toContain('Доступ запрещён');
    expect(readSession()).toBeNull();
    expect((screen.getByRole('button', { name: 'Подключиться' }) as HTMLButtonElement).disabled).toBe(false);

    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));
    await screen.findByRole('heading', { name: 'Инстанс подключён' });
    await user.click(screen.getByRole('button', { name: 'Отключиться' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('сохраняет данные при временном сбое и позволяет повторить вход', async () => {
    saveSession(savedCredentials);
    vi.mocked(GreenApiTelegram.prototype.getState).mockRejectedValueOnce(new GreenApiError('Сервис недоступен.', 503));
    await act(async () => { render(<App />); });
    await screen.findByRole('alert');

    expect(readSession()).toEqual(savedCredentials);
    expect((screen.getByLabelText('Токен API') as HTMLInputElement).value).toBe(savedCredentials.apiTokenInstance);
    await userEvent.click(screen.getByRole('button', { name: 'Подключиться' }));
    expect(await screen.findByRole('heading', { name: 'Инстанс подключён' })).toBeTruthy();
  });

  it('не сохраняет данные после отмены восстановления', async () => {
    saveSession(savedCredentials);
    let finish!: (state: string) => void;
    vi.mocked(GreenApiTelegram.prototype.getState).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => { render(<App />); });
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    await act(async () => { finish('authorized'); });

    expect(readSession()).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Инстанс подключён' })).toBeNull();
    expect(GreenApiTelegram.prototype.getSettings).not.toHaveBeenCalled();
  });

  it('предупреждает, если браузер запретил сохранение подключения', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Недостаточно места.', 'QuotaExceededError'); });
    render(<App />);
    const user = await fillCredentials();
    await user.click(screen.getByRole('button', { name: 'Подключиться' }));

    expect(await screen.findByRole('heading', { name: 'Инстанс подключён' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Браузер не разрешил сохранить');
  });

  it('открывает форму при повреждённой записи в хранилище', () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, '{broken');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Подключите Telegram' })).toBeTruthy();
    expect(GreenApiTelegram.prototype.getState).not.toHaveBeenCalled();
    expect(readSession()).toBeNull();
  });

  it('показывает Suspense до завершения обеих проверок без вспышки формы входа', async () => {
    saveSession(savedCredentials);
    let finish!: (settings: { incomingWebhook: 'yes'; webhookUrl: string }) => void;
    vi.mocked(GreenApiTelegram.prototype.getSettings).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await act(async () => { render(<StrictMode><App /></StrictMode>); });

    expect(screen.getByRole('heading', { name: 'Восстанавливаем подключение' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Проверяем сохранённый аккаунт');
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Инстанс подключён' })).toBeNull();
    expect(GreenApiTelegram.prototype.getState).toHaveBeenCalledTimes(1);
    expect(GreenApiTelegram.prototype.getSettings).toHaveBeenCalledTimes(1);

    await act(async () => { finish({ incomingWebhook: 'yes', webhookUrl: '' }); });
    expect(screen.getByRole('heading', { name: 'Инстанс подключён' })).toBeTruthy();
    expect(screen.queryByText('Восстанавливаем подключение')).toBeNull();
  });

  it('отменяет восстановление при удалении страницы, сохраняя данные для следующей загрузки', async () => {
    saveSession(savedCredentials);
    vi.mocked(GreenApiTelegram.prototype.getState).mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Запрос отменён.', 'AbortError')), { once: true });
    }));
    let view!: ReturnType<typeof render>;
    await act(async () => { view = render(<StrictMode><App /></StrictMode>); });
    const signal = vi.mocked(GreenApiTelegram.prototype.getState).mock.calls[0]?.[0];
    expect(signal?.aborted).toBe(false);

    await act(async () => { view.unmount(); });
    expect(signal?.aborted).toBe(true);
    expect(readSession()).toEqual(savedCredentials);
  });
});
