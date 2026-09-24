import { useCallback, useState } from 'react';
import type { Credentials } from '../index';
import type { Session } from '../session/connection';
import { clearSession, saveSession } from '../session/storage';
import { ConnectionForm } from './ConnectionForm';

interface ConnectionPanelProps {
  session?: Session | null;
  credentials?: Credentials | null;
  error?: string;
  notice?: string;
}

export function ConnectionPanel({ session: initialSession = null, credentials = null, error = '', notice: initialNotice = '' }: ConnectionPanelProps) {
  const [session, setSession] = useState(initialSession);
  const [savedCredentials, setSavedCredentials] = useState(credentials);
  const [notice, setNotice] = useState(initialNotice);
  const [formError, setFormError] = useState(error);
  const receivingEnabled = session?.settings.incomingWebhook === 'yes' && session.settings.webhookUrl === '';

  const connect = useCallback((nextSession: Session, nextCredentials: Credentials) => {
    const saved = saveSession(nextCredentials);
    if (!saved) clearSession();
    setNotice(saved ? '' : 'Браузер не разрешил сохранить подключение. После обновления страницы войдите снова.');
    setSavedCredentials(null);
    setFormError('');
    setSession(nextSession);
  }, []);

  const disconnect = useCallback(() => {
    const cleared = clearSession();
    setSavedCredentials(null);
    setFormError('');
    setSession(null);
    setNotice(cleared ? '' : 'Браузер не разрешил удалить сохранённые данные. Очистите хранилище этой вкладки.');
  }, []);

  return (
    <>
      {notice && <p className="notice" role="alert">{notice}</p>}
      {session ? (
        <>
          <h1 id="connection-title">Инстанс подключён</h1>
          <p className="intro" role="status">Доступ к Telegram подтверждён.</p>
          <dl className="connection-details">
            <div><dt>ID инстанса</dt><dd>{session.idInstance}</dd></div>
            <div><dt>Состояние</dt><dd><span className="status-dot" />Авторизован</dd></div>
            <div><dt>Приём через HTTP</dt><dd>{receivingEnabled ? 'Настроен' : 'Нужна настройка'}</dd></div>
          </dl>
          {!receivingEnabled && (
            <p className="notice" role="status">В личном кабинете включите входящие уведомления и очистите адрес webhook. Затем подключитесь снова.</p>
          )}
          <button className="button secondary" onClick={disconnect}>Отключиться</button>
        </>
      ) : (
        <>
          <h1 id="connection-title">Подключите Telegram</h1>
          <p className="intro">Введите данные инстанса из кабинета GREEN-API. Аккаунт Telegram должен быть авторизован.</p>
          <ConnectionForm initialCredentials={savedCredentials} initialError={formError} onConnect={connect} onForget={disconnect} />
        </>
      )}
    </>
  );
}
