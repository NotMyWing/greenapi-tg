import { useState } from "react";
import { faTelegram } from "@fortawesome/free-brands-svg-icons/faTelegram";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons/faArrowUpRightFromSquare";
import { ConnectionForm } from "./components/ConnectionForm";
import { ChatWorkspace } from "./chat/ChatWorkspace";
import { Icon } from "./components/Icon";
import type { Session } from "./session/connection";

export function App() {
  const [session, setSession] = useState<Session | null>(null);

  return (
    <div className="app">
      <header className="app-header">
        <a
          className="brand"
          href="./"
          aria-label="Telegram · GREEN-API, главная"
        >
          <span className="brand-mark">
            <Icon icon={faTelegram} />
          </span>
          <span>
            Telegram <span className="brand-divider">/</span>{" "}
            <span className="brand-provider">GREEN-API</span>
          </span>
        </a>
        <a
          className="header-link"
          href="https://console.green-api.com/"
          target="_blank"
          rel="noreferrer"
        >
          Личный кабинет <Icon icon={faArrowUpRightFromSquare} />
        </a>
      </header>

      <main className="main">
        {session ? (
          <ChatWorkspace
            session={session}
            onDisconnect={() => setSession(null)}
          />
        ) : (
          <section
            className="connection-card"
            aria-labelledby="connection-title"
          >
            <h1 id="connection-title">Подключите Telegram</h1>
            <p className="intro">
              Введите данные инстанса из кабинета GREEN-API. Аккаунт Telegram
              должен быть авторизован.
            </p>
            <ConnectionForm onConnect={setSession} />
          </section>
        )}
      </main>
    </div>
  );
}
