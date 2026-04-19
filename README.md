# Grafik PVZ Telegram App

Минимальный backend + стартовая Telegram Mini App страница с ролями:
- `ADMIN`
- `EMPLOYEE`

## Что уже сделано
- Сервер API на `Express`.
- База SQLite с таблицей `users`.
- Роуты логина и ролей.
- Страница Mini App на `/`.
- Скрипты запуска/остановки с `ngrok`.

## Что нужно от тебя (один раз)
1. Зарегистрируйся в ngrok: https://dashboard.ngrok.com/signup
2. Скопируй токен: https://dashboard.ngrok.com/get-started/your-authtoken
3. Выполни в PowerShell:

```powershell
& "C:\Users\husht\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe" config add-authtoken <ТВОЙ_NGROK_TOKEN>
```

Если ngrok блокируется по IP/политике, скрипт автоматически переключится на `cloudflared`, а при нестабильности Cloudflare — на `localhost.run`.

## Запуск (каждый раз)
```powershell
cd "C:\Users\husht\OneDrive\Рабочий стол\grafik"
powershell -ExecutionPolicy Bypass -File .\scripts\start-miniapp.ps1
```

Скрипт выведет:
- `Backend: http://localhost:3000`
- `Tunnel: ngrok` или `Tunnel: cloudflared` или `Tunnel: localhost.run`
- `Mini App URL: https://...ngrok...`

Именно `Mini App URL` вставляй в `@BotFather` для Mini App.

## Остановка
```powershell
cd "C:\Users\husht\OneDrive\Рабочий стол\grafik"
powershell -ExecutionPolicy Bypass -File .\scripts\stop-miniapp.ps1
```

## API (роли)
1. `POST /api/auth/login`
2. `GET /api/auth/me` (header `x-telegram-id`)
3. `GET /api/admin/users` (только `ADMIN`)
4. `PATCH /api/admin/users/:telegramId/role` (только `ADMIN`)

Если `ADMIN_TELEGRAM_IDS` пустой, первый вошедший пользователь получает роль `ADMIN`.
Последнего администратора нельзя понизить до `EMPLOYEE`.
