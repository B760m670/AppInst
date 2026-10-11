#!/usr/bin/env bash
# One-time server setup: installs Docker if needed, creates .env and starts everything.
# Usage (on an Ubuntu/Debian VPS, as root):  bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Устанавливаю Docker…"
  curl -fsSL https://get.docker.com | sh
fi

if [ ! -f .env ]; then
  ip=$(curl -fsS https://api.ipify.org || curl -fsS https://ifconfig.me)
  default_domain="${ip//./-}.sslip.io"

  read -rp "Токен бота от @BotFather: " bot_token
  read -rp "Username бота без @ (например my_shop_bot): " bot_username
  read -rp "Ваш Telegram id (узнать у @userinfobot), через запятую если админов несколько: " admin_ids
  read -rp "Ссылка на поддержку (например https://t.me/my_support), можно пусто: " support_url
  read -rp "Домен [${default_domain}]: " domain
  domain=${domain:-$default_domain}

  cp .env.example .env
  set_env() { sed -i "s|^$1=.*|$1=$2|" .env; }
  set_env DOMAIN "$domain"
  set_env PUBLIC_URL "https://$domain"
  set_env BOT_TOKEN "$bot_token"
  set_env BOT_USERNAME "$bot_username"
  set_env ADMIN_IDS "$admin_ids"
  set_env SUPPORT_URL "$support_url"
  set_env INSTALL_LINK_SECRET "$(openssl rand -hex 24)"
  chmod 600 .env
  echo "==> Создан .env (данные Freekassa можно добавить позже и выполнить: docker compose up -d)"
fi

docker compose up -d --build
domain=$(grep '^DOMAIN=' .env | cut -d= -f2)
echo
echo "Готово. Через минуту проверьте: https://$domain/api/v1/health"
echo "В @BotFather → /newapp укажите URL Mini App: https://$domain"
