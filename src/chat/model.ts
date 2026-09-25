import type {
  HistoryMessage,
  IncomingTextMessage,
  MessageStatus,
  OutgoingMessageStatus,
  TelegramChat,
} from "../api/green-api";

export interface ChatMessage {
  id: string;
  text: string;
  timestamp: number;
  direction: "incoming" | "outgoing";
  status: MessageStatus | "sending" | "received";
  senderName?: string;
  error?: string;
}

export interface Chat {
  id: string;
  title: string;
  phone?: string;
  messages: ChatMessage[];
  draft: string;
  unread: number;
}

export interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
}

type ChatAction =
  | { type: "chats-loaded"; chats: TelegramChat[] }
  | { type: "history-loaded"; chatId: string; messages: HistoryMessage[] }
  | ({ type: "status" } & OutgoingMessageStatus)
  | { type: "open"; chatId: string; phone: string }
  | { type: "select"; chatId: string | null }
  | { type: "draft"; chatId: string; text: string }
  | { type: "received"; message: IncomingTextMessage }
  | { type: "sending"; chatId: string; message: ChatMessage }
  | { type: "sent"; chatId: string; localId: string; messageId: string }
  | { type: "failed"; chatId: string; localId: string; error: string };

const statusRank = {
  sending: 0,
  queued: 1,
  sent: 2,
  received: 2,
  failed: 3,
  delivered: 4,
  read: 5,
};

function advanceStatus(
  message: ChatMessage,
  status: ChatMessage["status"],
  error?: string,
): ChatMessage {
  // Сохраняем последний подтверждённый этап доставки.
  if (statusRank[message.status] > statusRank[status]) return message;
  return {
    ...message,
    status,
    error:
      status === "failed"
        ? (error ?? message.error ?? "Не удалось доставить сообщение.")
        : undefined,
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === "chats-loaded") {
    const chats = new Map(state.chats.map((chat) => [chat.id, chat]));
    for (const item of action.chats) {
      const existing = chats.get(item.id);
      chats.set(
        item.id,
        existing
          ? {
              ...existing,
              title: item.title === item.id ? existing.title : item.title,
              phone: item.phone ?? existing.phone,
            }
          : { ...item, messages: [], draft: "", unread: 0 },
      );
    }
    return { ...state, chats: [...chats.values()] };
  }
  if (action.type === "open") {
    const existing = state.chats.some((chat) => chat.id === action.chatId);
    const chats = existing
      ? state.chats
      : [
          {
            id: action.chatId,
            title: `+${action.phone}`,
            phone: action.phone,
            messages: [],
            draft: "",
            unread: 0,
          },
          ...state.chats,
        ];
    return {
      activeChatId: action.chatId,
      chats: chats.map((chat) =>
        chat.id === action.chatId ? { ...chat, unread: 0 } : chat,
      ),
    };
  }
  if (action.type === "select") {
    return {
      activeChatId: action.chatId,
      chats: state.chats.map((chat) =>
        chat.id === action.chatId ? { ...chat, unread: 0 } : chat,
      ),
    };
  }
  if (action.type === "received") {
    const message = action.message;
    const existing = state.chats.find((chat) => chat.id === message.chatId);
    if (existing?.messages.some((item) => item.id === message.id)) return state;
    const chat = existing ?? {
      id: message.chatId,
      title: message.senderName || message.chatId,
      messages: [],
      draft: "",
      unread: 0,
    };
    const updated: Chat = {
      ...chat,
      title:
        !chat.id.startsWith("-") &&
        message.senderName &&
        message.senderName !== message.chatId
          ? message.senderName
          : chat.title,
      messages: [
        ...chat.messages,
        { ...message, direction: "incoming", status: "received" },
      ],
      unread: chat.unread + (state.activeChatId === chat.id ? 0 : 1),
    };
    return {
      ...state,
      chats: [updated, ...state.chats.filter((item) => item.id !== chat.id)],
    };
  }
  return {
    ...state,
    chats: state.chats.map((chat) => {
      if (chat.id !== action.chatId) return chat;
      switch (action.type) {
        case "history-loaded": {
          const messages = new Map<string, ChatMessage>(
            action.messages.map((message) => [message.id, message]),
          );
          // При совпадении ID берём текст из чата и последний статус доставки.
          for (const message of chat.messages) {
            const historical = messages.get(message.id);
            messages.set(
              message.id,
              historical
                ? advanceStatus(message, historical.status, historical.error)
                : message,
            );
          }
          return {
            ...chat,
            messages: [...messages.values()].sort(
              (a, b) => a.timestamp - b.timestamp,
            ),
          };
        }
        case "status":
          return {
            ...chat,
            messages: chat.messages.map((message) =>
              message.id === action.messageId &&
              message.direction === "outgoing"
                ? advanceStatus(message, action.status, action.error)
                : message,
            ),
          };
        case "draft":
          return { ...chat, draft: action.text };
        case "sending":
          return { ...chat, messages: [...chat.messages, action.message] };
        case "sent": {
          const status =
            chat.messages.find((message) => message.id === action.messageId)
              ?.status ?? "queued";
          return {
            ...chat,
            draft: "",
            messages: chat.messages
              .filter((message) => message.id !== action.messageId)
              .map((message) =>
                message.id === action.localId
                  ? {
                      ...advanceStatus(message, status),
                      id: action.messageId,
                    }
                  : message,
              ),
          };
        }
        case "failed":
          return {
            ...chat,
            messages: chat.messages.map((message) =>
              message.id === action.localId
                ? { ...message, status: "failed", error: action.error }
                : message,
            ),
          };
      }
    }),
  };
}
