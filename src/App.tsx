import { Suspense, use, useEffect, useRef, useState } from 'react';
import { ConnectionPanel } from './components/ConnectionPanel';
import { SessionLoading } from './components/SessionLoading';
import { createSessionRestoration } from './session/restoration';
import type { SessionRestoration } from './session/restoration';
import { clearSession, readSession } from './session/storage';

function RestoredConnection({ restoration }: { restoration: SessionRestoration }) {
  const result = use(restoration.promise);
  return <ConnectionPanel {...result} />;
}

export function App() {
  const [restoration, setRestoration] = useState(() => {
    const credentials = readSession();
    return credentials ? createSessionRestoration(credentials) : null;
  });
  const [notice, setNotice] = useState('');
  const activeRestoration = useRef(restoration);

  useEffect(() => {
    activeRestoration.current = restoration;
    return () => {
      activeRestoration.current = null;
      // StrictMode повторяет эффект; отменяем только после настоящего удаления.
      queueMicrotask(() => {
        if (activeRestoration.current !== restoration) restoration?.cancel();
      });
    };
  }, [restoration]);

  function cancelRestoration() {
    restoration?.cancel();
    const cleared = clearSession();
    setNotice(cleared ? '' : 'Браузер не разрешил удалить сохранённые данные. Очистите хранилище этой вкладки.');
    setRestoration(null);
  }

  return (
    <div className="app">
      <header className="app-header">
        <a className="brand" href="./" aria-label="Telegram · GREEN-API, главная">
          <span className="brand-mark" aria-hidden="true">↗</span>
          <span>Telegram <span className="brand-divider">/</span> <span className="brand-provider">GREEN-API</span></span>
        </a>
        <a className="header-link" href="https://console.green-api.com/" target="_blank" rel="noreferrer">Личный кабинет ↗</a>
      </header>

      <main className="main">
        <section className="connection-card" aria-labelledby="connection-title">
          <span className="eyebrow">TELEGRAM · GREEN-API</span>
          <Suspense fallback={<SessionLoading onCancel={cancelRestoration} />}>
            {restoration
              ? <RestoredConnection restoration={restoration} />
              : <ConnectionPanel notice={notice} />}
          </Suspense>
        </section>
      </main>
    </div>
  );
}
