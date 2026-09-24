export interface Credentials {
  apiUrl: string;
  idInstance: string;
  apiTokenInstance: string;
}

export interface IncomingTextMessage {
  id: string;
  chatId: string;
  text: string;
  timestamp: number;
  direction: 'incoming' | 'outgoing';
  senderName: string;
}

export interface InstanceSettings {
  incomingWebhook: 'yes' | 'no';
  webhookUrl: string;
}

export interface ResolvedChat {
  chatId: string;
}

export interface SentMessage {
  idMessage: string;
}

export interface Notification {
  receiptId: number;
  body: unknown;
}
