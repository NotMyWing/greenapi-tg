export { GreenApiTelegram } from './api/green-api.js';
export { GreenApiError } from './api/utils/errors.js';
export { parseTextMessage } from './api/utils/messages.js';
export { MAX_MESSAGE_LENGTH, normalizePhone } from './api/utils/validation.js';
export type {
  Credentials,
  IncomingTextMessage,
  InstanceSettings,
  Notification,
  ResolvedChat,
  SentMessage,
} from './api/utils/types.js';
