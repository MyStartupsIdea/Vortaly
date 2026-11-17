# Деплой на Vercel (старт без своего домена)

Цель: Vortaly Console и Vortaly Mini App работают по HTTPS на бесплатном адресе
`https://<проект>.vercel.app`. Бизнесы открываются по пути
(`https://<проект>.vercel.app/chinor`), поддомены и свой домен не нужны.

Ни один секрет не попадает в репозиторий: все значения вписываются только в
панель Vercel (Project → Settings → Environment Variables).

## 1. Перед деплоем: боевая база

1. Создайте **отдельный** Supabase-проект для продакшена. Тот, что сейчас в
   `.env.local`, для этого не годится: в нём уже есть тестовые строки.
2. В SQL-редакторе нового проекта выполните по порядку:
   - `supabase/schema.sql` — все таблицы, RLS и сид;
   - `supabase/migrations/2026-11-16_sites.sql` и
     `supabase/migrations/2026-11-17_site_ai.sql` — повторный запуск
     безопасен, они уже входят в `schema.sql`.
3. Запомните регион проекта (Settings → General): он понадобится в шаге 4.

## 2. Импорт проекта

1. vercel.com → Add New → Project → импортируйте репозиторий с GitHub.
2. Framework Preset определится сам: **Next.js**. Build Command, Output
   Directory и Install Command оставьте по умолчанию.
3. Settings → General → **Node.js Version: 22.x** (проект требует Node 22+,
   см. `.nvmrc`).
4. Перед первым деплоем заполните переменные из шага 3, иначе сборка пройдёт, а
   приложение запустится без базы.

## 3. Переменные окружения

Для каждой переменной в Vercel выбирается окружение: **Production** (основной
адрес) и/или **Preview** (сборки веток и PR). Боевые ключи — только в
Production.

Переменные `NEXT_PUBLIC_*` встраиваются в код при сборке: после их изменения
нужен новый деплой (Deployments → Redeploy).

### Публичные (видны в браузере)

| Переменная | Значение | Окружение |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `https://<проект>.vercel.app` | Production |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `vortaly.com` — пока домен не куплен, это только подпись в интерфейсе. **Не** указывайте `vercel.app` | Production, Preview |
| `NEXT_PUBLIC_SUPABASE_URL` | URL боевого Supabase-проекта | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key боевого проекта | Production |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | имя бота без `@` | Production |

### Секретные (только сервер; в Vercel отметьте **Sensitive**)

| Переменная | Значение | Окружение |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | secret/service key боевого проекта | Production |
| `PLATFORM_ADMIN_SECRET` | длинная случайная строка — пароль Vortaly Console | Production |
| `VORTALY_KEY_SECRET` | длинная случайная строка — шифрует ключи ИИ владельцев. Смена значения «забывает» все сохранённые ключи | Production |
| `TELEGRAM_BOT_TOKEN` | токен от @BotFather | Production |
| `GEMINI_API_KEY_1`, `GROQ_API_KEY_1`, `OPENROUTER_API_KEY_1`, `ORCAROUTER_API_KEY_1` | ключи платформы для бесплатных сборок; достаточно одного | Production |

Случайную строку можно получить командой:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Необязательные

| Переменная | Значение |
| --- | --- |
| `VORTALY_FREE_AI_ACTIONS` | бесплатных действий ИИ на сайт, по умолчанию `5` |
| `VORTALY_MODEL_PROVIDER`, `VORTALY_MODEL_ID` | какой провайдер ИИ пробовать первым |

### Пока не задавать

`CLICK_*` и `PAYME_*` — серверные колбэки оплаты ещё не реализованы
(`/api/payments/*` отвечает 501). Оплата на пилоте — в салоне.

### Preview-сборки

Не давайте Preview боевые ключи Supabase. Без них Preview работает в режиме
«нет базы»: страницы открываются, но ничего не сохраняет. Если Preview нужен с
данными, создайте для него третий, тестовый Supabase-проект.

## 4. Регион функций

Settings → Functions → **Function Region**: выберите регион, ближайший к
региону Supabase из шага 1 (например, Frankfurt для `eu-central-1`). Каждый
запрос к странице ходит в базу; если функция и база на разных континентах,
каждый такой поход добавляет задержку.

## 5. Что проверить в условиях Vercel

Условия меняются, поэтому сверьтесь с vercel.com/docs и страницей тарифов:

- **Коммерческое использование.** Тариф Hobby предназначен для некоммерческих
  проектов. Для пилота это допустимо; когда бизнесы начнут платить, понадобится
  Pro.
- **Длительность функций.** Сборка и правка сайта ИИ объявляют
  `maxDuration = 120` секунд (`app/api/builder/*`, `app/api/admin/provision`).
  Если лимит тарифа меньше, долгий ответ модели оборвётся; тогда уменьшите
  `maxDuration` в этих файлах до лимита.
- **Доступность из Узбекистана.** Откройте адрес `*.vercel.app` с местного
  мобильного интернета и Wi-Fi.

## 6. Проверка после деплоя

- [ ] `https://<проект>.vercel.app/` открывает Vortaly Console.
- [ ] `https://<проект>.vercel.app/api/admin/salons` без входа отвечает **401**.
- [ ] В консоли вход по `PLATFORM_ADMIN_SECRET` показывает реальный список
      бизнесов, а не демо-проекты.
- [ ] Создание бизнеса в консоли проходит, журнал пишет `draft saved to supabase`.
- [ ] `/builder/<slug>` показывает «Бесплатных действий ИИ осталось: N из 5»;
      правка через чат работает и уменьшает счётчик.
- [ ] После «Опубликовать» страница `/<slug>` открывается и принимает запись;
      запись появляется в таблице `bookings`.
- [ ] Ни один секрет не попал в клиентский код: откройте консоль в браузере,
      DevTools → Sources → поиск по всем файлам (Ctrl+Shift+F) по значению
      `PLATFORM_ADMIN_SECRET` и `VORTALY_KEY_SECRET` ничего не находит.

## 7. Telegram

Когда адрес работает: @BotFather → ваш бот → Bot Settings → Configure Mini App
(или `/newapp`) → URL `https://<проект>.vercel.app/<slug>`. Откройте Mini App в
Telegram и сделайте тестовую запись.

## 8. Когда появится свой домен

Project → Settings → Domains → добавьте `vortaly.com` и `*.vortaly.com`
(для поддоменов бизнесов Vercel, скорее всего, попросит перевести DNS домена на
свои nameservers — сверьтесь с его документацией). Затем обновите
`NEXT_PUBLIC_ROOT_DOMAIN` и `NEXT_PUBLIC_APP_URL` и сделайте Redeploy. Переезд
не нужен: это тот же проект. Полный список — в `docs/launch-checklist.md`.
