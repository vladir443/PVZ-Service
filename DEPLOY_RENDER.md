# Деплой PVZ Service на Render

Render подходит нам лучше Railway trial, потому что можно подключить постоянный диск для SQLite.

Важно: для рабочей версии нужен план с Disk. Бесплатный web-service может засыпать, а без Disk база не будет надежно сохраняться.

## 1. Зайти на Render

Открой:

```text
https://render.com
```

Зарегистрируйся или войди через GitHub.

## 2. Создать сервис из GitHub

1. Нажми `New`.
2. Выбери `Blueprint`.
3. Подключи репозиторий:

```text
https://github.com/vladir443/PVZ-Service.git
```

Render прочитает файл `render.yaml` и сам создаст web-service с диском `/data`.

## 3. Проверить переменные

В Render открой сервис `pvz-service` -> `Environment`.

Должно быть:

```text
NODE_ENV=production
HOST=0.0.0.0
DATABASE_PATH=/data/grafik.db
```

Если используешь SMS:

```text
SMS_WEBHOOK_URL=<ссылка SMS-сервиса>
SMS_WEBHOOK_TOKEN=<секрет SMS-сервиса>
```

Если оставляем Telegram-напоминания:

```text
TELEGRAM_BOT_TOKEN=<токен бота>
```

## 4. Дождаться деплоя

Вкладка `Events` или `Logs` покажет сборку и запуск.

Нормальный лог:

```text
API is running on http://localhost:...
```

## 5. Проверить сайт

Открой публичную ссылку Render.

Проверка API:

```text
https://<твоя-ссылка-render>/health
```

Должно показать:

```json
{"ok":true}
```

## 6. Дальше

После каждого `git push` в `main` Render будет автоматически обновлять сайт.

