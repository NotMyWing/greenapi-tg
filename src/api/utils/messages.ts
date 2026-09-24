import type { IncomingTextMessage } from './types.js';
import { isRecord, isText } from './validation.js';

/** Возвращает текстовое событие с временем в миллисекундах; остальные события пропускает. */
export function parseTextMessage(body: unknown): IncomingTextMessage | null {
  if (!isRecord(body)) return null;
  const direction = body.typeWebhook === 'incomingMessageReceived'
    ? 'incoming'
    : body.typeWebhook === 'outgoingMessageReceived' || body.typeWebhook === 'outgoingAPIMessageReceived'
      ? 'outgoing'
      : null;
  if (!direction || !isRecord(body.senderData) || !isRecord(body.messageData)) return null;
  const { senderData, messageData } = body;
  if (
    !isText(body.idMessage) || !isText(senderData.chatId) ||
    !/^-?[1-9]\d*$/.test(senderData.chatId) ||
    typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp) ||
    body.timestamp < 0 || body.timestamp > 8_640_000_000_000
  ) return null;

  let text: unknown;
  if (messageData.typeMessage === 'textMessage' && isRecord(messageData.textMessageData)) {
    text = messageData.textMessageData.textMessage;
  } else if (messageData.typeMessage === 'extendedTextMessage' && isRecord(messageData.extendedTextMessageData)) {
    text = messageData.extendedTextMessageData.text;
  }
  if (!isText(text)) return null;

  return {
    id: body.idMessage,
    chatId: senderData.chatId,
    text,
    timestamp: body.timestamp * 1000,
    direction,
    senderName: isText(senderData.senderName) ? senderData.senderName : senderData.chatId,
  };
}
