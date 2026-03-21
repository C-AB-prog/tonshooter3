# TON SHOOTER - Telegram Mini App

Аркадный тайминг-шутер с экономикой и выводом TON.

## 📋 Структура проекта

```
ton-shooter/
├── backend/
│   ├── server.js           # Главный сервер Express
│   ├── package.json        # Зависимости
│   ├── .env.example        # Пример конфигурации
│   ├── database/
│   │   └── db.js          # Подключение к PostgreSQL
│   ├── middleware/
│   │   ├── auth.js        # Авторизация через Telegram WebApp
│   │   └── antibot.js     # Защита от ботов
│   └── routes/
│       ├── game.js        # Игровые эндпоинты
│       ├── user.js        # Пользователь
│       ├── upgrades.js    # Прокачка
│       └── ...            # Остальные routes
├── database/
│   └── schema.sql         # SQL схема базы данных
└── frontend/
    └── index.html         # Telegram WebApp (Single Page)
```

## 🚀 Установка

### 1. Клонирование репозитория

```bash
git clone https://github.com/your-repo/ton-shooter.git
cd ton-shooter
```

### 2. Настройка базы данных PostgreSQL

```bash
# Создать базу данных
createdb ton_shooter

# Применить схему
psql -d ton_shooter -f database/schema.sql
```

### 3. Настройка backend

```bash
cd backend
npm install

# Создать .env файл
cp .env.example .env
# Отредактировать .env с вашими данными
```

### 4. Создание Telegram бота

1. Откройте [@BotFather](https://t.me/BotFather)
2. Создайте нового бота: `/newbot`
3. Получите токен бота
4. Настройте меню бота: `/setmenubutton`
5. Настройте WebApp URL

### 5. Запуск backend

```bash
npm start
# или для разработки
npm run dev
```

### 6. Деплой frontend

Frontend — это один HTML файл, который нужно разместить на HTTPS-хостинге:

```bash
# Простой вариант - Vercel
vercel deploy frontend/

# Или любой другой хостинг с HTTPS
# Selectel, Netlify, GitHub Pages и т.д.
```

## ⚙️ Конфигурация

### .env файл (backend)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/ton_shooter

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_BOT_USERNAME=your_bot_username
WEBAPP_URL=https://your-domain.com

# Server
PORT=3000
NODE_ENV=production

# TON
TON_NETWORK=testnet
TON_API_KEY=your_api_key

# Game settings
MIN_ACTION_INTERVAL_MS=100
MAX_REFERRAL_REWARDS_PER_DAY=10

# Withdrawal
DEVELOPER_FEE_PERCENT=5
MIN_WITHDRAWAL_TON=1
MAX_WITHDRAWAL_TON=25
WITHDRAWAL_COOLDOWN_HOURS=24
```

### Frontend (index.html)

Замените в файле:
```javascript
const API_URL = 'YOUR_API_URL_HERE'; // на ваш backend URL
```

## 📡 API Endpoints

### Игра
- `GET /api/game/state` - Получить состояние игры
- `POST /api/game/shoot` - Выстрел
- `POST /api/game/session/start` - Начать сессию
- `POST /api/game/session/end` - Завершить сессию
- `GET /api/game/leaderboard` - Таблица лидеров

### Пользователь
- `GET /api/user/profile` - Профиль
- `POST /api/user/wallet` - Обновить TON кошелек

### Улучшения
- `GET /api/upgrades/available` - Доступные улучшения
- `POST /api/upgrades/purchase` - Купить улучшение

### Рефералы
- `GET /api/referrals/stats` - Статистика рефералов

### Обмен
- `POST /api/exchange/coins-to-crystals` - Обменять Coins → Crystals
- `POST /api/exchange/crystals-to-ton` - Обменять Crystals → TON

### Вывод
- `POST /api/withdrawal/request` - Запрос на вывод TON

### Задания
- `GET /api/tasks/list` - Список заданий
- `POST /api/tasks/complete` - Выполнить задание

### Админ
- `POST /api/admin/tasks/create` - Создать задание

## 🎮 Игровая механика

### Энергия
- Максимум: 100
- Регенерация: 1 энергия / 5 минут
- Стоимость выстрела: `1 + WeaponLevel + RangeLevel`

### Награды
- Формула: `300 + 250 × WeaponLevel + 200 × RangeLevel`
- Только за попадание

### Сложность
- После каждого попадания:
  - Зона попадания сужается (мин. 30%)
  - Скорость бегунка увеличивается
- После промаха сложность сбрасывается

### Прокачка
- Максимальный уровень: 10
- Ограничение: `|WeaponLevel - RangeLevel| ≤ 3`
- Оплата: только Coins

#### Стоимость улучшений
| Уровень | Стоимость (Coins) |
|---------|-------------------|
| 1 → 2   | 50,000            |
| 2 → 3   | 120,000           |
| 3 → 4   | 300,000           |
| 4 → 5   | 800,000           |
| 5 → 6   | 2,000,000         |
| 6 → 7   | 5,000,000         |
| 7 → 8   | 12,000,000        |
| 8 → 9   | 25,000,000        |
| 9 → 10  | 50,000,000        |

### Валюты и обмен
- **Coins** → **Crystals**: 100,000 Coins = 1 Crystal
- **Crystals** → **TON**: 100 Crystals = 1 TON
- **Итого**: 1 TON = 10,000,000 Coins

### Вывод TON
- Минимум: 1 TON
- Максимум: 25 TON
- Кулдаун: 24 часа
- Комиссия: конфигурируется (по умолчанию 5%)

### Рефералы
- Награда: 250,000 Coins
- Условия активности:
  - Минимум 50 выстрелов
  - Минимум 20 попаданий
  - Возраст аккаунта 24+ часов
  - Не заблокирован антибот-системой

## 🛡️ Анти-бот система

### Проверки
1. **Минимальные интервалы** между действиями (100ms)
2. **Анализ паттернов** кликов:
   - Идентичные тайминги
   - Роботизированные интервалы
   - Невозможная точность
   - Нечеловеческая реакция
3. **Защита рефералов** от накрутки
4. **Серверная валидация** всех действий

### Действия при подозрении
- Логирование в `antibot_logs`
- Увеличение `action_pattern_score`
- При превышении порога → блокировка аккаунта

## 🔐 Безопасность

### Авторизация
- Валидация через Telegram WebApp `initData`
- Проверка HMAC с использованием bot token
- Срок действия auth данных: 24 часа

### Защита данных
- Все операции с балансом в транзакциях
- Row-level locking при критичных операциях
- Серверная валидация всех игровых действий

## 📊 Мониторинг

### Метрики для отслеживания
- Активные пользователи (DAU/MAU)
- Конверсия в оплату
- Средний lifetime value
- Retention rate
- Подозрительная активность

### Логи
```bash
# Backend логи
pm2 logs ton-shooter

# Database логи
tail -f /var/log/postgresql/postgresql.log

# Анти-бот логи
SELECT * FROM antibot_logs 
WHERE severity = 'critical' 
ORDER BY created_at DESC 
LIMIT 100;
```

## 🚀 Деплой на Selectel

### Backend (VDS)

```bash
# Установить Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Установить PostgreSQL
sudo apt-get install postgresql postgresql-contrib

# Клонировать проект
git clone https://github.com/your-repo/ton-shooter.git
cd ton-shooter/backend

# Установить зависимости
npm install

# Настроить PM2
sudo npm install -g pm2
pm2 start server.js --name ton-shooter
pm2 startup
pm2 save

# Настроить Nginx как reverse proxy
sudo apt-get install nginx
# Создать конфиг в /etc/nginx/sites-available/ton-shooter
```

### Frontend (S3 или CDN)

```bash
# Загрузить index.html на Selectel Object Storage
# Или использовать их CDN
```

## 🧪 Тестирование

```bash
# Backend тесты
npm test

# Нагрузочное тестирование
npm run load-test

# Проверка анти-бот системы
npm run test:antibot
```

## 📝 TODO

- [ ] Интеграция TON Connect для вывода
- [ ] Система бустов (покупка за Crystals/TON)
- [ ] Админ-панель для управления заданиями
- [ ] Push-уведомления через Telegram
- [ ] Еженедельные турниры
- [ ] Достижения и badges
- [ ] Звуковые эффекты
- [ ] Анимации попаданий/промахов

## 📄 Лицензия

Proprietary - All rights reserved

## 👥 Поддержка

Для вопросов и поддержки: @your_telegram

---

Made with ⚡ for TON ecosystem
