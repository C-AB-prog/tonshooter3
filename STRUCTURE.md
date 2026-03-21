# Структура проекта TON SHOOTER

```
ton-shooter/
├── README.md                    # Полная документация
├── STRUCTURE.md                 # Этот файл
├── .gitignore                   # Git ignore правила
│
├── frontend/
│   └── index.html              # Telegram WebApp (Single Page Application)
│                                # - Интеграция с Telegram WebApp API
│                                # - Все экраны: Игра, Улучшения, Задания, Профиль
│                                # - Glassmorphism дизайн с анимациями
│
├── backend/
│   ├── package.json            # Node.js зависимости
│   ├── .env.example            # Пример конфигурации
│   ├── server.js               # Главный Express сервер + Telegram Bot
│   │
│   ├── database/
│   │   └── db.js              # PostgreSQL подключение
│   │
│   ├── middleware/
│   │   ├── auth.js            # Авторизация через Telegram WebApp
│   │   └── antibot.js         # Защита от ботов + анализ паттернов
│   │
│   └── routes/
│       ├── game.js            # Игровые эндпоинты (стрельба, сессии, лидерборд)
│       ├── user.js            # Профиль, кошелек
│       ├── upgrades.js        # Прокачка оружия/полигона
│       ├── referrals.js       # Реферальная система
│       ├── tasks.js           # Задания (подписка на каналы)
│       ├── withdrawal.js      # Вывод TON
│       ├── exchange.js        # Обмен валют (Coins↔Crystals↔TON)
│       └── admin.js           # Админ-панель
│
└── database/
    └── schema.sql              # PostgreSQL схема
                                 # - 15+ таблиц
                                 # - Функции, триггеры, индексы
                                 # - Полная структура БД

```

## Количество файлов по типам

- **Backend (JavaScript)**: 11 файлов
  - 1 главный сервер
  - 2 middleware
  - 8 routes
  - 1 database connector

- **Frontend (HTML)**: 1 файл
  - Single Page Application
  - Полная интеграция с Telegram WebApp
  - Все экраны и функции

- **Database (SQL)**: 1 файл
  - Полная схема PostgreSQL
  - Функции для игровой логики

- **Документация (Markdown)**: 2 файла
  - README с инструкциями
  - STRUCTURE с описанием

## Технологии

### Backend
- **Node.js** 18+
- **Express.js** — веб-сервер
- **PostgreSQL** — база данных
- **node-telegram-bot-api** — Telegram Bot API
- **TON SDK** — для работы с TON blockchain

### Frontend
- **Vanilla JavaScript** — без фреймворков
- **Telegram WebApp API** — интеграция с Telegram
- **CSS3** — glassmorphism, анимации
- **Google Fonts** — Orbitron + Rajdhani

### Database
- **PostgreSQL 14+** — реляционная БД
- Транзакции, triggers, stored procedures
- Полная нормализация

## Ключевые фичи по файлам

### server.js
- Express сервер
- Telegram Bot команды (/start, /stats, /ref)
- Роутинг API
- Graceful shutdown

### middleware/auth.js
- Валидация Telegram WebApp initData
- HMAC проверка
- Проверка auth_date

### middleware/antibot.js
- Проверка минимальных интервалов
- Анализ паттернов кликов
- Детекция роботизированного поведения
- Логирование подозрительных действий

### routes/game.js
- GET /api/game/state — состояние игры
- POST /api/game/shoot — выстрел
- POST /api/game/session/start — начало сессии
- POST /api/game/session/end — конец сессии
- GET /api/game/leaderboard — таблица лидеров

### routes/upgrades.js
- GET /api/upgrades/available — доступные улучшения
- POST /api/upgrades/purchase — купить улучшение
- Проверка баланса уровней (|W-R| ≤ 3)

### routes/exchange.js
- POST /api/exchange/coins-to-crystals
- POST /api/exchange/crystals-to-ton
- GET /api/exchange/rates
- GET /api/exchange/history

### routes/withdrawal.js
- POST /api/withdrawal/request — запрос вывода
- GET /api/withdrawal/history — история выводов
- Проверка кулдауна 24ч

### frontend/index.html
- Telegram WebApp init
- Навигация между экранами
- Игровая механика (тайминг-бар, стрельба)
- API интеграция
- Энергия, статистика, улучшения

## Следующие шаги

1. Распаковать архив
2. Настроить PostgreSQL и запустить schema.sql
3. Настроить .env файл
4. npm install в backend/
5. Создать Telegram бота
6. Загрузить frontend на HTTPS хостинг
7. Запустить backend сервер
8. Настроить WebApp URL в боте

Подробнее см. README.md
