#!/usr/bin/env bash
# One-time server setup: installs Docker if needed, creates .env and starts everything.
# Usage (on an Ubuntu/Debian VPS, as root):  bash scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Small VPS (1 GB RAM): add swap so the image build (pnpm install + vite) does not run out of memory.
if [ "$(swapon --show | wc -l)" -eq 0 ] && [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ]; then
  echo "==> Добавляю swap 2 ГБ…"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

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

  https_port=443
  if ss -tln | grep -qE '[:.]443 '; then
    https_port=8443
    echo "==> Порт 443 занят (например, VPN) — сайт будет на порту 8443"
  fi
  public_url="https://$domain"
  [ "$https_port" = 443 ] || public_url="https://$domain:$https_port"

  cp .env.example .env
  set_env() { sed -i "s|^$1=.*|$1=$2|" .env; }
  set_env DOMAIN "$domain"
  set_env HTTPS_PORT "$https_port"
  set_env PUBLIC_URL "$public_url"
  set_env BOT_TOKEN "$bot_token"
  set_env BOT_USERNAME "$bot_username"
  set_env ADMIN_IDS "$admin_ids"
  set_env SUPPORT_URL "$support_url"
  set_env INSTALL_LINK_SECRET "$(openssl rand -hex 24)"
  chmod 600 .env
  echo "==> Создан .env (данные Freekassa можно добавить позже и выполнить: docker compose up -d)"
fi

docker compose up -d --build
url=$(grep '^PUBLIC_URL=' .env | cut -d= -f2)
echo
echo "Готово. Через минуту проверьте: $url/api/v1/health"
echo "В @BotFather → /newapp укажите URL Mini App: $url"
