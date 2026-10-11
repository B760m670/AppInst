# AppInst

Telegram-бот и Mini App для продажи установки iPhone-приложений. Механика повторяет vseapki
(разбор в [`docs/vseapki-analysis.md`](docs/vseapki-analysis.md)): каталог → оплата → установка по
OTA-ссылке через Safari → активация по инструкции.

```
apps/server     Fastify API + бот на grammY + страница установки + приём оплаты Freekassa (PostgreSQL)
apps/miniapp    Mini App на React/Vite (каталог, оплата, покупки, рефералы, админка)
packages/shared Цены и общие типы
```

## Как это работает

1. Пользователь открывает Mini App из бота (кнопка меню или `/start`). Сервер проверяет подпись
   Telegram `initData` на каждом запросе (`Authorization: tma <initData>`).
2. В каталоге он выбирает приложения. Цена ступенчатая: каждое следующее приложение дешевле,
   есть минимальная цена, наценка и акция «N приложений за X ₽». Всё это настраивается в админке.
3. `POST /api/v1/orders` создаёт заказ и возвращает ссылку на оплату Freekassa.
   Клиент передаёт сумму, которую видел пользователь. Если цена успела измениться, заказ не создаётся.
4. Freekassa присылает оповещение на `/payments/freekassa`. Сервер проверяет IP и подпись,
   сверяет сумму, помечает заказ оплаченным (повторное оповещение ничего не меняет), создаёт покупки,
   начисляет реферальный бонус и пишет пользователю в бот.
5. В покупке пользователь нажимает «Начать установку». Открывается окно на 12 часов и выдаётся
   подписанная ссылка `/install/<token>`. Эта страница в Safari отдаёт
   `itms-services://?action=download-manifest&url=<manifest_url приложения>`, и iOS ставит приложение.
   После окончания окна ссылка перестаёт работать.
6. Дальше в Mini App показывается инструкция по активации через «Контент и покупки» и
   дополнительные шаги приложения (например, сертификаты Минцифры).
   Данные для входа пока выдаёт поддержка: автоматической выдачи логина и кода в этой версии нет.

## Запуск локально

Нужны Node.js 22, pnpm 10 и PostgreSQL 16 (или `docker compose up db`).

```bash
cp .env.example .env        # заполнить переменные
pnpm install
pnpm migrate                # создать таблицы
pnpm seed                   # демо-каталог (без manifest_url, поэтому купить пока нельзя)
pnpm build                  # собрать Mini App
pnpm start                  # сервер + бот (polling)
```

Для разработки интерфейса: `pnpm dev:server` и `pnpm dev:miniapp` (Vite проксирует `/api` на :3000).

Тесты: `TEST_DATABASE_URL=postgres://… pnpm test`. Без этой переменной тесты API пропускаются.

## Боевой запуск

1. **Бот.** Создать бота в @BotFather, затем `/newapp`. URL Mini App = `PUBLIC_URL`,
   short name указать в `MINIAPP_SHORT_NAME`. Кнопку меню сервер выставляет сам при старте.
2. **Сервер.** Нужен VPS на Ubuntu/Debian с публичным IP и открытыми портами 80 и 443. На сервере:
   ```bash
   git clone https://github.com/B760m670/AppInst && cd AppInst
   bash scripts/setup.sh
   ```
   Скрипт ставит Docker, спрашивает токен бота, username и ваш Telegram id, создаёт `.env`
   и запускает базу, приложение и Caddy (HTTPS). Без своего домена подставляется бесплатный адрес
   [sslip.io](https://sslip.io) по IP сервера. Позже домен меняется в `DOMAIN` и `PUBLIC_URL`,
   а в @BotFather обновляется URL Mini App.
   Без данных Freekassa бот и каталог работают, только оформление заказа отключено.
   После правки `.env` выполните `docker compose up -d`.
3. **Freekassa**, в настройках магазина:
   - URL оповещения: `https://<PUBLIC_URL>/payments/freekassa` (метод POST);
   - URL успеха и неудачи: `https://t.me/<BOT_USERNAME>/<MINIAPP_SHORT_NAME>`;
   - секретные слова 1 и 2 записать в `FREEKASSA_SECRET_1` и `FREEKASSA_SECRET_2`.
   Если нужен конкретный способ оплаты (например, СБП), укажите его id в `FREEKASSA_METHOD_ID`.
4. **Админы.** Telegram id админов перечислить в `ADMIN_IDS`. У них в Mini App появится вкладка «Админ».

## Админка (вкладка «Админ»)

- **Приложения:** название, категория, иконка, версия, iOS, **URL manifest.plist (https)**, популярное,
  видимость, доп. инструкции в JSON `[{"title": "...", "steps": ["..."], "link": "deeplink://..."}]`.
  Без `manifest_url` приложение видно в каталоге, но купить его нельзя.
- **Заказы:** последние 200 заказов.
- **Выводы:** заявки на вывод реферальных денег. «Выплачено» закрывает заявку, «Отклонить» возвращает баланс.
- **Настройки:** цены, акция, пауза «Технические работы» (блокирует новые заказы и старт установки).

Сброс окна установки для поддержки делается через API: `POST /api/v1/admin/purchases/:id/reset`.

Пример `manifest.plist`, который хостится вместе с IPA:

```xml
<plist version="1.0"><dict><key>items</key><array><dict>
  <key>assets</key><array><dict>
    <key>kind</key><string>software-package</string>
    <key>url</key><string>https://cdn.example.com/app.ipa</string>
  </dict></array>
  <key>metadata</key><dict>
    <key>bundle-identifier</key><string>com.example.app</string>
    <key>bundle-version</key><string>1.0</string>
    <key>kind</key><string>software</string>
    <key>title</key><string>App</string>
  </dict>
</dict></array></dict></plist>
```

## Дальше

- Выдача данных аккаунта и кодов подтверждения прямо в Mini App с таймером (сейчас через поддержку).
- Повторная установка по разрешению поддержки, возвраты, Telegram Stars.
- Рассылки по пользователям из админки, аналитика.

## Важно

Сервис отвечает только за продажу и выдачу ссылок. Откуда берутся IPA и аккаунты, решает оператор,
и это его ответственность. Распространение чужих приложений и общие Apple ID нарушают правила Apple
и могут нарушать права разработчиков. Подробнее о рисках в разборе vseapki.
