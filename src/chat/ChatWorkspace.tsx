import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons/faArrowLeft";
import {
  errorMessage,
  MAX_MESSAGE_LENGTH,
  normalizePhone,
} from "../api/green-api";
import type { OutgoingMessageStatus } from "../api/green-api";
import type { Session } from "../session/connection";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { MessageList } from "./MessageList";
import { chatReducer } from "./model";
import { pollNotifications } from "./polling";

interface ChatWorkspaceProps {
  session: Session;
  onDisconnect: () => void;
}

export function ChatWorkspace({ session, onDisconnect }: ChatWorkspaceProps) {
  const chat = useChat(session);
  const [phone, setPhone] = useState("");
  const conversationTitle = useRef<HTMLHeadingElement>(null);
  const chatList = useRef<HTMLElement>(null);
  const returnToChat = useRef<string | null>(null);
  const moveFocus = useRef(false);
  const active = chat.chats.find((item) => item.id === chat.activeChatId);
  const composer = useAutosizeTextarea(active?.draft, active?.id);
  const receivingProblem = !chat.receivingEnabled || chat.receiveError;

  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    if (active) conversationTitle.current?.focus();
    else {
      const buttons =
        chatList.current?.querySelectorAll<HTMLButtonElement>("[data-chat-id]");
      Array.from(buttons ?? [])
        .find((button) => button.dataset.chatId === returnToChat.current)
        ?.focus();
    }
  }, [active?.id]);

  function selectChat(id: string | null) {
    moveFocus.current =
      window.matchMedia?.("(max-width: 760px)").matches ?? false;
    if (id === null) returnToChat.current = active?.id ?? null;
    chat.selectChat(id);
  }

  async function createChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    moveFocus.current =
      window.matchMedia?.("(max-width: 760px)").matches ?? false;
    if (await chat.openChat(phone)) setPhone("");
    else moveFocus.current = false;
  }

  return (
    <section
      className={`chat-workspace ${active ? "has-active-chat" : ""}`}
      aria-label="Telegram"
    >
      <aside className="chat-sidebar">
        <header className="sidebar-header">
          <div>
            <h1>Чаты</h1>
            <span className="instance-label">Инстанс {session.idInstance}</span>
          </div>
          <button
            className="text-button icon-button"
            type="button"
            aria-label="Отключиться"
            title="Отключиться"
            onClick={onDisconnect}
          >
            <svg
              className="icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M10 12h11m-4-4 4 4-4 4" />
            </svg>
          </button>
        </header>

        {chat.chatsError && (
          <div className="chat-notice" role="alert">
            <p>{chat.chatsError}</p>
            <button className="text-button" onClick={chat.retryChats}>
              Повторить загрузку чатов
            </button>
          </div>
        )}
        <nav
          ref={chatList}
          className="chat-navigation"
          aria-label="Список чатов"
          aria-busy={chat.chatsLoading}
        >
          {chat.chatsLoading && (
            <p className="chat-empty" role="status">
              Загрузка чатов…
            </p>
          )}
          {chat.chats.length === 0 &&
            !chat.chatsLoading &&
            !chat.chatsError && <p className="chat-empty">Нет чатов</p>}
          <ul>
            {chat.chats.map((item) => {
              const lastMessage = item.messages.at(-1);
              return (
                <li key={item.id}>
                  <button
                    className={`chat-item ${item.id === active?.id ? "selected" : ""}`}
                    data-chat-id={item.id}
                    aria-current={item.id === active?.id ? "true" : undefined}
                    onClick={() => selectChat(item.id)}
                  >
                    <Avatar id={item.id} name={item.title} size={48} />
                    <span className="chat-item-content">
                      <span className="chat-item-title">{item.title}</span>
                      <span className="chat-preview">
                        {item.draft
                          ? `Черновик: ${item.draft}`
                          : lastMessage
                            ? `${lastMessage.direction === "outgoing" ? "Вы: " : ""}${lastMessage.text}`
                            : item.phone
                              ? `+${item.phone}`
                              : ""}
                      </span>
                    </span>
                    {item.unread > 0 && (
                      <span
                        className="unread-count"
                        aria-label={`Непрочитанных: ${item.unread}`}
                      >
                        {item.unread}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <form
          className="new-chat-form"
          aria-label="Создать чат"
          onSubmit={createChat}
        >
          <label htmlFor="recipient-phone">Номер телефона</label>
          <div className="phone-row">
            <input
              id="recipient-phone"
              type="tel"
              placeholder="+7 999 123-45-67"
              autoComplete="tel"
              required
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={chat.creating}
            />
            <button
              className="button primary"
              type="submit"
              disabled={chat.creating || !phone.trim()}
            >
              {chat.creating ? "Ищем…" : "Новый чат"}
            </button>
          </div>
          {chat.createError && (
            <p className="inline-error" role="alert">
              {chat.createError}
            </p>
          )}
        </form>
      </aside>

      <div className="conversation">
        <header className="conversation-header">
          <button
            className="text-button icon-button back-to-chats"
            aria-label="Чаты"
            title="Чаты"
            onClick={() => selectChat(null)}
          >
            <Icon icon={faArrowLeft} />
          </button>
          {active && <Avatar id={active.id} name={active.title} size={40} />}
          <h2 ref={conversationTitle} tabIndex={-1} title={active?.title}>
            {active?.title ?? "Сообщения"}
          </h2>
        </header>

        {receivingProblem && (
          <div className="chat-notice" role="status">
            <p>
              {chat.receiveError ??
                "В личном кабинете включите входящие уведомления и очистите адрес webhook, чтобы получать ответы."}
            </p>
            <button
              className="text-button"
              onClick={() => void chat.refreshSettings()}
              disabled={chat.checkingSettings}
            >
              {chat.checkingSettings ? "Проверяем…" : "Проверить подключение"}
            </button>
          </div>
        )}

        {active ? (
          <>
            {chat.historyError && (
              <div className="chat-notice" role="alert">
                <p>{chat.historyError}</p>
                <button className="text-button" onClick={chat.retryHistory}>
                  Повторить загрузку сообщений
                </button>
              </div>
            )}
            <MessageList
              key={active.id}
              messages={active.messages}
              chatId={active.id}
              chatTitle={active.title}
              loading={chat.historyLoading}
            />
            <form
              className="message-composer"
              aria-label="Отправить сообщение"
              onSubmit={(event) => {
                event.preventDefault();
                void chat.sendMessage();
              }}
            >
              <label className="visually-hidden" htmlFor="message-text">
                Сообщение
              </label>
              <textarea
                ref={composer}
                id="message-text"
                placeholder="Написать сообщение…"
                rows={1}
                maxLength={MAX_MESSAGE_LENGTH}
                value={active.draft}
                disabled={chat.sendingChatId !== null}
                onChange={(event) =>
                  chat.setDraft(active.id, event.target.value)
                }
                title="Enter: отправить, Shift+Enter: новая строка"
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    void chat.sendMessage();
                  }
                }}
              />
              <div className="composer-actions">
                {active.draft.length > 3500 && (
                  <span className="character-count">
                    {active.draft.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                )}
                <button
                  className="text-button icon-button send-button"
                  type="submit"
                  aria-label={
                    chat.sendingChatId === active.id ? "Отправка…" : "Отправить"
                  }
                  title={
                    chat.sendingChatId === active.id ? "Отправка…" : "Отправить"
                  }
                  disabled={chat.sendingChatId !== null || !active.draft.trim()}
                >
                  <svg
                    className="icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <path d="m21 3-6.5 18-4.5-7-7-4.5L21 3ZM10 14 21 3" />
                  </svg>
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="conversation-empty">
            Выберите чат или введите номер телефона
          </div>
        )}
      </div>
    </section>
  );
}

function useChat(session: Session) {
  const [state, dispatch] = useReducer(chatReducer, {
    chats: [],
    activeChatId: null,
  });
  const lifetime = useRef<AbortController | null>(null);
  const opening = useRef(false);
  const sending = useRef(false);
  const sendingStatuses = useRef<OutgoingMessageStatus[]>([]);
  const checking = useRef(false);
  const [creating, setCreating] = useState(false);
  const [sendingChatId, setSendingChatId] = useState<string | null>(null);
  const [createError, setCreateError] = useState("");
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [settings, setSettings] = useState(session.settings);
  const [checkingSettings, setCheckingSettings] = useState(false);
  const [pollVersion, setPollVersion] = useState(0);
  const [chatsVersion, setChatsVersion] = useState(0);
  const [chatsLoading, setChatsLoading] = useState(true);
  const [chatsError, setChatsError] = useState("");
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const loadedHistory = useRef(new Set<string>());
  const historyRequestedAt = useRef(0);
  const receivingEnabled =
    settings.incomingWebhook === "yes" && settings.webhookUrl === "";

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, [session.client]);

  useEffect(() => {
    const controller = new AbortController();
    setChatsLoading(true);
    setChatsError("");
    // Таймер даёт StrictMode отменить первый запуск перед запросом.
    const timer = setTimeout(() => {
      void session.client
        .getChats(controller.signal)
        .then((chats) => {
          if (!controller.signal.aborted)
            dispatch({ type: "chats-loaded", chats });
        })
        .catch((cause: unknown) => {
          if (!controller.signal.aborted) setChatsError(errorMessage(cause));
        })
        .finally(() => {
          if (!controller.signal.aborted) setChatsLoading(false);
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [session.client, chatsVersion]);

  useEffect(() => {
    const chatId = state.activeChatId;
    setHistoryError("");
    setHistoryLoading(false);
    if (!chatId || loadedHistory.current.has(chatId)) return;
    const controller = new AbortController();
    setHistoryLoading(true);
    // GREEN-API принимает один запрос истории в секунду для всех чатов.
    const timer = setTimeout(
      () => {
        historyRequestedAt.current = Date.now();
        void session.client
          .getChatHistory(chatId, controller.signal)
          .then((messages) => {
            if (controller.signal.aborted) return;
            loadedHistory.current.add(chatId);
            dispatch({ type: "history-loaded", chatId, messages });
          })
          .catch((cause: unknown) => {
            if (!controller.signal.aborted)
              setHistoryError(errorMessage(cause));
          })
          .finally(() => {
            if (!controller.signal.aborted) setHistoryLoading(false);
          });
      },
      Math.max(0, 1100 - (Date.now() - historyRequestedAt.current)),
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [session.client, state.activeChatId, historyVersion]);

  useEffect(() => {
    if (!receivingEnabled) return;
    const controller = new AbortController();
    void pollNotifications(session.client, {
      signal: controller.signal,
      onMessage: (message) => dispatch({ type: "received", message }),
      onStatus: (status) => {
        dispatch({ type: "status", ...status });
        // Храним статусы, пока ждём ID сообщения от sendMessage.
        if (sending.current) sendingStatuses.current.push(status);
      },
      onError: setReceiveError,
    });
    return () => controller.abort();
  }, [session.client, receivingEnabled, pollVersion]);

  async function openChat(value: string): Promise<boolean> {
    const controller = lifetime.current;
    if (!controller || opening.current) return false;
    opening.current = true;
    setCreating(true);
    setCreateError("");
    try {
      const phone = normalizePhone(value);
      const { chatId } = await session.client.resolvePhone(
        phone,
        controller.signal,
      );
      if (controller.signal.aborted) return false;
      dispatch({ type: "open", chatId, phone });
      return true;
    } catch (cause) {
      if (!controller.signal.aborted) setCreateError(errorMessage(cause));
      return false;
    } finally {
      opening.current = false;
      if (!controller.signal.aborted) setCreating(false);
    }
  }

  async function sendMessage() {
    const controller = lifetime.current;
    const chat = state.chats.find((item) => item.id === state.activeChatId);
    if (!controller || !chat?.draft.trim() || sending.current) return;
    const localId = `local:${crypto.randomUUID()}`;
    sending.current = true;
    setSendingChatId(chat.id);
    dispatch({
      type: "sending",
      chatId: chat.id,
      message: {
        id: localId,
        text: chat.draft,
        timestamp: Date.now(),
        direction: "outgoing",
        status: "sending",
      },
    });
    try {
      const { idMessage } = await session.client.sendMessage(
        chat.id,
        chat.draft,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        dispatch({
          type: "sent",
          chatId: chat.id,
          localId,
          messageId: idMessage,
        });
        for (const status of sendingStatuses.current) {
          if (status.chatId === chat.id && status.messageId === idMessage)
            dispatch({ type: "status", ...status });
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        dispatch({
          type: "failed",
          chatId: chat.id,
          localId,
          error: errorMessage(cause),
        });
    } finally {
      sending.current = false;
      sendingStatuses.current = [];
      if (!controller.signal.aborted) setSendingChatId(null);
    }
  }

  async function refreshSettings() {
    const controller = lifetime.current;
    if (!controller || checking.current) return;
    checking.current = true;
    setCheckingSettings(true);
    try {
      const next = await session.client.getSettings(controller.signal);
      if (!controller.signal.aborted) {
        setSettings(next);
        setReceiveError(null);
        setPollVersion((version) => version + 1);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setReceiveError(errorMessage(cause));
    } finally {
      checking.current = false;
      if (!controller.signal.aborted) setCheckingSettings(false);
    }
  }

  return {
    ...state,
    creating,
    sendingChatId,
    createError,
    receiveError,
    receivingEnabled,
    checkingSettings,
    chatsLoading,
    chatsError,
    historyLoading,
    historyError,
    retryChats: () => setChatsVersion((version) => version + 1),
    retryHistory: () => setHistoryVersion((version) => version + 1),
    openChat,
    sendMessage,
    refreshSettings,
    selectChat: (chatId: string | null) => dispatch({ type: "select", chatId }),
    setDraft: (chatId: string, text: string) =>
      dispatch({ type: "draft", chatId, text }),
  };
}

function resize(field: HTMLTextAreaElement) {
  field.style.height = "auto";
  const borderHeight = field.offsetHeight - field.clientHeight;
  field.style.height = `${field.scrollHeight + borderHeight}px`;
}

/** Подгоняем высоту поля под текст и ширину. CSS задаёт предел высоты и прокрутку. */
function useAutosizeTextarea(
  value: string | undefined,
  chatId: string | undefined,
) {
  const field = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (field.current) resize(field.current);
  }, [value, chatId]);

  useLayoutEffect(() => {
    const element = field.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    let width = element.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      // Меняем высоту в следующем кадре после замера ширины.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => resize(element));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [chatId]);

  return field;
}
