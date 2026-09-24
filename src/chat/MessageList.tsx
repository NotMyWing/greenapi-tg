import { useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "./model";
import { Avatar } from "../components/Avatar";
import { MessageStatus } from "./MessageStatus";
import { FormattedText } from "./FormattedText";

const timeFormat = new Intl.DateTimeFormat("ru", {
  hour: "2-digit",
  minute: "2-digit",
});
const dateFormat = new Intl.DateTimeFormat("ru", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
interface MessageListProps {
  messages: ChatMessage[];
  chatId: string;
  chatTitle: string;
  loading: boolean;
}

export function MessageList({
  messages,
  chatId,
  chatTitle,
  loading,
}: MessageListProps) {
  const container = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);

  useLayoutEffect(() => {
    const element = container.current;
    if (element && followLatest.current)
      element.scrollTop = element.scrollHeight;
  }, [messages]);

  useLayoutEffect(() => {
    const element = container.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (followLatest.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="message-list"
      role="log"
      aria-label="Сообщения"
      aria-relevant="additions"
      aria-busy={loading}
      tabIndex={0}
      ref={container}
      onScroll={() => {
        const element = container.current;
        if (element)
          followLatest.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            80;
      }}
    >
      {loading && (
        <p className="chat-empty" role="status">
          Загрузка сообщений…
        </p>
      )}
      {messages.length === 0 && !loading && (
        <p className="chat-empty">Нет сообщений</p>
      )}
      <ol>
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const next = messages[index + 1];
          const date = dateFormat.format(message.timestamp);
          const authorId = message.direction === "outgoing" ? "self" : chatId;
          const name =
            message.direction === "outgoing"
              ? "Вы"
              : message.senderName || chatTitle;
          // Начинаем новую группу при смене автора, даты или паузе больше пяти минут.
          const groupStart =
            !previous ||
            previous.direction !== message.direction ||
            previous.senderName !== message.senderName ||
            dateFormat.format(previous.timestamp) !== date ||
            message.timestamp - previous.timestamp > 300_000;
          const groupEnd =
            !next ||
            next.direction !== message.direction ||
            next.senderName !== message.senderName ||
            dateFormat.format(next.timestamp) !== date ||
            next.timestamp - message.timestamp > 300_000;
          return (
            <li
              key={message.id}
              className={`message-row ${message.direction}${groupEnd ? " group-end" : ""}`}
            >
              {(!previous ||
                dateFormat.format(previous.timestamp) !== date) && (
                <div className="message-date">{date}</div>
              )}
              <div className="message-content">
                <span className="message-avatar">
                  {groupEnd && <Avatar id={authorId} name={name} size={32} />}
                </span>
                <div
                  className={`message-bubble ${message.status === "failed" ? "message-failed" : ""}`}
                >
                  {groupStart && name && !/^[+\d-]+$/.test(name) && (
                    <div className="message-author">{name}</div>
                  )}
                  <div className="message-text">
                    <FormattedText text={message.text} />
                    <span className="message-meta">
                      <time
                        dateTime={new Date(message.timestamp).toISOString()}
                      >
                        {timeFormat.format(message.timestamp)}
                      </time>
                      {message.direction === "outgoing" && (
                        <MessageStatus status={message.status} />
                      )}
                    </span>
                  </div>
                  {message.error && (
                    <p className="message-error">{message.error}</p>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
