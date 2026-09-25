# Telegram · GREEN-API

Чат на React для обмена текстовыми сообщениями через GREEN-API.

Нужен Node.js 24 LTS (от 24.15).

```sh
npm ci
npm run dev
```

Откройте в браузере адрес из терминала.

1. Авторизуйте инстанс Telegram в [кабинете GREEN-API](https://console.green-api.com/).
2. Включите `incomingWebhook`, `outgoingMessageWebhook`, `outgoingAPIMessageWebhook` и `outgoingWebhook`. Очистите `webhookUrl`.
3. Введите данные инстанса в приложении. Выберите чат или создайте его по номеру телефона.

Запустите тесты командой `npm test`. Команда `npm run build` сохранит сборку в папке `dist/`.
