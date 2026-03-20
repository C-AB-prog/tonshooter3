# TON Shooter Unified Project

Единый проект, собранный из двух архивов без дублей и мусора.

## Структура
- `api/` — backend на Express + Prisma
- `bot/` — Telegram bot на Telegraf
- `web/` — Telegram Mini App / frontend на React + Vite

## Что объединено
- За основу взята структура монорепы из `apps.zip`.
- Во `web/` перенесена более свежая и визуально улучшенная версия фронтенда из `tohshooterr.zip`.
- Удалены лишние артефакты: `.git`, `node_modules`, `dist`, логи, backup-файлы.
- Исключены дублирующиеся standalone-файлы второго проекта, чтобы остался один цельный проект.

## Запуск
Для каждого приложения зависимости ставятся отдельно:

### API
```bash
cd api
npm install
npm run build
npm run start
```

### Bot
```bash
cd bot
npm install
npm run build
npm run start
```

### Web
```bash
cd web
npm install
npm run dev
```
