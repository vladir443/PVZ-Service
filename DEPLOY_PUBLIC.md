# Public URL (Railway)

Use this to get a stable HTTPS URL for Telegram Mini App.

## 1) Push project to GitHub

1. Create a new GitHub repo (empty).
2. Upload this project to that repo.

## 2) Create Railway project

1. Open https://railway.app
2. `New Project` -> `Deploy from GitHub repo`
3. Select your repository.

## 3) Set environment variables

In Railway service -> `Variables`, set:

- `PORT=3000`
- `DATABASE_PATH=/data/grafik.db`
- `TELEGRAM_BOT_TOKEN=<your_bot_token>`
- `ADMIN_TELEGRAM_IDS=<your_telegram_id>` (optional, comma-separated for multiple admins)

## 4) Add persistent volume

1. In Railway project, add a Volume to your app service.
2. Mount path: `/data`

This keeps SQLite data between deploys/restarts.

## 5) Generate public domain

1. Open service `Settings` -> `Networking`
2. Click `Generate Domain`
3. You will get URL like `https://your-app.up.railway.app`

Use this URL in BotFather as Mini App URL.

## 6) Verify

Open:

- `https://your-app.up.railway.app/health` -> should return `{"ok":true}`
- `https://your-app.up.railway.app` -> app page should open

## Notes

- If you change code, just push to GitHub again; Railway will redeploy.
- If the app starts but role/login behaves incorrectly, confirm variables are set exactly as above.
