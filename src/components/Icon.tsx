import { config, type IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import '@fortawesome/fontawesome-svg-core/styles.css';

// Подключаем стили иконок через сборку.
config.autoAddCss = false;

export function Icon({ icon }: { icon: IconDefinition }) {
  return <FontAwesomeIcon className="icon" icon={icon} aria-hidden="true" focusable="false" />;
}
