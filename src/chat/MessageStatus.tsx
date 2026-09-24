import type { ChatMessage } from './model';
import { faClock } from '@fortawesome/free-solid-svg-icons/faClock';
import { faCircleExclamation } from '@fortawesome/free-solid-svg-icons/faCircleExclamation';
import { Icon } from '../components/Icon';

const labels: Record<ChatMessage['status'], string> = {
  sending: 'Отправка…',
  queued: 'В очереди',
  sent: 'Отправлено',
  delivered: 'Доставлено',
  read: 'Прочитано',
  received: 'Получено',
  failed: 'Ошибка отправки',
};

export function MessageStatus({ status }: { status: ChatMessage['status'] }) {
  const pending = status === 'sending' || status === 'queued';
  const confirmed = status === 'sent' || status === 'delivered' || status === 'read';
  return (
    <span className={`message-status status-${status}`} title={labels[status]}>
      <span className="visually-hidden">{labels[status]}</span>
      {confirmed
        ? <span className="message-check" aria-hidden="true" />
        : <Icon icon={pending ? faClock : faCircleExclamation} />}
    </span>
  );
}
