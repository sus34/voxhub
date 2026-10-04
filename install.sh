#!/usr/bin/env bash
# voxhub installer. On a fresh Ubuntu 22.04/24.04 (or Debian 12) VPS:
#
#   curl -fsSL https://raw.githubusercontent.com/sus34/voxhub/main/install.sh | sudo bash
#
# Installs Docker if needed, asks for the address and ports (suggesting
# answers that work on this box), starts everything and prints the link and
# the setup code. Any answer can be given in advance as an environment
# variable (DOMAIN, NODE_IP, HTTPS_PORT, …); YES=1 takes the suggestions
# without asking.
set -euo pipefail

REPO=${VOXHUB_REPO:-https://github.com/sus34/voxhub.git}
REF=${VOXHUB_REF:-main}
DIR=${VOXHUB_DIR:-/opt/voxhub}
YES=${YES:-}
STARTED=$(date +%s)

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
info() { printf '  %s\n' "$*"; }
warn() { printf '\033[33m  %s\033[0m\n' "$*" >&2; }
die() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

# Questions go to the terminal even when the script itself comes from a pipe.
has_tty() { [ -z "$YES" ] && { : < /dev/tty; } 2> /dev/null; }

# ask VAR "question" default — keeps VAR if it was set in the environment.
ask() {
  local var=$1 question=$2 default=$3 answer
  if [ -n "${!var:-}" ]; then return; fi
  if has_tty; then
    read -r -p "  $question [$default]: " answer < /dev/tty
    printf -v "$var" '%s' "${answer:-$default}"
  else
    printf -v "$var" '%s' "$default"
  fi
}

confirm() { # confirm "question" — yes by default
  local answer
  has_tty || return 0
  read -r -p "  $1 [Y/n]: " answer < /dev/tty
  [ -z "$answer" ] || [ "$answer" = y ] || [ "$answer" = Y ] || [ "$answer" = д ] || [ "$answer" = Д ]
}

# ------------------------------------------------------------------ checks

[ "$(id -u)" = 0 ] || die "Запусти от root: curl -fsSL … | sudo bash"

# shellcheck source=/dev/null
. /etc/os-release
case "$ID" in
  ubuntu | debian) ;;
  *) warn "Проверено на Ubuntu 22.04/24.04 и Debian 12, у тебя $PRETTY_NAME — пробую." ;;
esac
case "$(uname -m)" in
  x86_64 | aarch64) ;;
  *) die "Процессор $(uname -m) не поддерживается: нужен x86_64 или arm64." ;;
esac

mem=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
[ "$mem" -ge 900 ] || warn "Памяти ${mem} МБ — нужно хотя бы 1 ГБ, может не хватить."

if [ -f "$DIR/.env" ]; then
  die "voxhub уже установлен в $DIR. Обновить: voxhub update"
fi
if [ -d "$DIR" ] && [ -n "$(ls -A "$DIR")" ]; then
  die "Папка $DIR занята чем-то другим. Поставь в другую: VOXHUB_DIR=/opt/voxhub2"
fi

# --------------------------------------------------------------- packages

say "1/5 Пакеты и Docker"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates openssl iproute2 cron > /dev/null

install_docker() {
  # Ubuntu's own packages come from the hoster's mirror, which is reachable
  # even where download.docker.com is not; elsewhere use Docker's script.
  if [ "$ID" = ubuntu ] && apt-get install -y -qq docker.io docker-compose-v2 > /dev/null 2>&1; then
    return
  fi
  curl -fsSL https://get.docker.com | sh
}

if ! command -v docker > /dev/null; then
  info "Ставлю Docker…"
  install_docker
elif ! docker compose version > /dev/null 2>&1; then
  info "Ставлю docker compose…"
  apt-get install -y -qq docker-compose-v2 > /dev/null 2>&1 ||
    apt-get install -y -qq docker-compose-plugin > /dev/null 2>&1 ||
    die "Не получилось поставить docker compose — поставь его и запусти установщик снова."
fi
systemctl enable --now docker > /dev/null 2>&1 || true
docker compose version > /dev/null || die "docker compose не работает."
info "$(docker --version)"

# ---------------------------------------------------------------- address

say "2/5 Адрес"

is_private() {
  case "$1" in
    10.* | 192.168.* | 127.* | 169.254.*) return 0 ;;
    172.1[6-9].* | 172.2[0-9].* | 172.3[0-1].*) return 0 ;;
    100.6[4-9].* | 100.[7-9][0-9].* | 100.1[0-1][0-9].* | 100.12[0-7].*) return 0 ;;
  esac
  return 1
}

seen_ip=""
for url in https://api.ipify.org https://ifconfig.me/ip https://icanhazip.com; do
  seen_ip=$(curl -4 -fsS --max-time 5 "$url" 2> /dev/null | tr -d '[:space:]') && [ -n "$seen_ip" ] && break
done

public_ips=()
while read -r ip; do
  is_private "$ip" || public_ips+=("$ip")
done < <(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1)

if [ "${#public_ips[@]}" -gt 1 ]; then
  info "На сервере несколько публичных адресов: ${public_ips[*]}"
  info "Нужен тот, до которого достают твои друзья (не заблокированный)."
fi
default_ip=${seen_ip:-${public_ips[0]:-}}
ask NODE_IP "Публичный IP сервера" "$default_ip"
[[ "$NODE_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Это не IPv4: $NODE_IP"

info "Свой домен не обязателен: подойдёт бесплатный ${NODE_IP//./-}.sslip.io."
ask DOMAIN "Домен" "${NODE_IP//./-}.sslip.io"
DOMAIN=${DOMAIN,,}
resolved=$(getent ahostsv4 "$DOMAIN" | awk 'NR == 1 {print $1}' || true)
if [ "$resolved" != "$NODE_IP" ]; then
  warn "$DOMAIN указывает на ${resolved:-ничего}, а не на $NODE_IP."
  warn "Сертификат не выпустится, пока в DNS нет A-записи $DOMAIN → $NODE_IP."
  confirm "Всё равно продолжить?" || die "Отменено."
fi

# ------------------------------------------------------------------ ports

say "3/5 Порты"

TAKEN=" " # ports this script has already handed out
tcp_owner() { ss -Htlnp "sport = :$1" 2> /dev/null | sed -n 's/.*users:(("\([^"]*\)".*/\1/p' | head -n 1; }
tcp_busy() { [ -n "$(ss -Htln "sport = :$1" 2> /dev/null)" ] || [[ "$TAKEN" == *" $1 "* ]]; }
udp_busy() { [ -n "$(ss -Huln "sport = :$1" 2> /dev/null)" ] || [[ "$TAKEN" == *" $1 "* ]]; }

# pick VAR tcp|udp first-choice — the first free port from first-choice up.
pick() {
  local var=$1 proto=$2 port=$3
  if [ -z "${!var:-}" ]; then
    while "${proto}_busy" "$port"; do port=$((port + 1)); done
    printf -v "$var" '%s' "$port"
  fi
  TAKEN+="${!var} "
}

if [ -z "${HTTPS_PORT:-}" ] && tcp_busy 443; then
  info "443 занят ($(tcp_owner 443)) — сайт будет на другом порту, звонкам это не мешает."
  suggested=""
  pick suggested tcp 8443
  ask HTTPS_PORT "Порт для сайта" "$suggested"
else
  pick HTTPS_PORT tcp 443
fi
TAKEN+="$HTTPS_PORT "

if [ -z "${HTTP_PORT:-}" ] && tcp_busy 80; then
  pick HTTP_PORT tcp 8080 # just the http→https redirect then
else
  pick HTTP_PORT tcp 80
fi

# Let's Encrypt checks the domain on port 80 or 443 of this box.
if [ -z "${TLS_MODE:-}" ]; then
  if [ "$HTTPS_PORT" = 443 ] || [ "$HTTP_PORT" = 80 ]; then
    TLS_MODE=auto
  else
    warn "Порты 80 ($(tcp_owner 80)) и 443 ($(tcp_owner 443)) оба заняты, а Let's Encrypt"
    warn "проверяет домен только через них. Подойдёт свой сертификат на $DOMAIN (certbot)."
    ask TLS_CERT_HOST "Путь к fullchain.pem" "/etc/letsencrypt/live/$DOMAIN/fullchain.pem"
    [ -f "$TLS_CERT_HOST" ] || die "Нет файла $TLS_CERT_HOST. Освободи порт 80 или выпусти сертификат (certbot) и запусти установщик снова."
    TLS_KEY_HOST=$(dirname "$TLS_CERT_HOST")/privkey.pem
    [ -f "$TLS_KEY_HOST" ] || die "Рядом с сертификатом нет privkey.pem."
    TLS_MODE=files
    # certbot's live/ holds symlinks into archive/, so mount the whole tree.
    case "$TLS_CERT_HOST" in
      /etc/letsencrypt/*) TLS_DIR=/etc/letsencrypt ;;
      *) TLS_DIR=$(dirname "$TLS_CERT_HOST") ;;
    esac
    TLS_CERT=/ext-certs/${TLS_CERT_HOST#"$TLS_DIR"/}
    TLS_KEY=/ext-certs/${TLS_KEY_HOST#"$TLS_DIR"/}
  fi
fi

pick APP_PORT tcp 3000
pick LIVEKIT_PORT tcp 7880
pick RTC_TCP_PORT tcp 7881
pick RTC_UDP_PORT udp 7882
pick TURN_UDP_PORT udp 3478
pick TURN_TLS_PORT tcp 5349

info "Сайт $HTTPS_PORT/tcp, сертификат и редирект $HTTP_PORT/tcp"
info "Звонки $RTC_UDP_PORT/udp, $RTC_TCP_PORT/tcp, TURN $TURN_UDP_PORT/udp и $TURN_TLS_PORT/tcp"

# ------------------------------------------------------------------- files

say "4/5 Файлы в $DIR"

git clone --quiet --branch "$REF" "$REPO" "$DIR"
cd "$DIR"

random_from() { # random_from ALPHABET LENGTH
  (set +o pipefail; LC_ALL=C tr -dc "$1" < /dev/urandom | head -c "$2")
}
code=$(random_from ABCDEFGHJKMNPQRSTUVWXYZ23456789 8)

if git describe --tags --exact-match > /dev/null 2>&1; then
  tag=$(git describe --tags --exact-match)
  tag=${tag#v}
else
  tag=$(git rev-parse --abbrev-ref HEAD | tr '/' '-')
fi

umask 077
cat > .env << EOF
# Written by install.sh $(date +%F). Change a value, then: voxhub restart
DOMAIN=$DOMAIN
NODE_IP=$NODE_IP
HTTPS_PORT=$HTTPS_PORT
HTTP_PORT=$HTTP_PORT
TLS_MODE=$TLS_MODE
${TLS_DIR:+TLS_DIR=$TLS_DIR}
${TLS_CERT:+TLS_CERT=$TLS_CERT}
${TLS_KEY:+TLS_KEY=$TLS_KEY}
LIVEKIT_API_KEY=API$(random_from a-zA-Z0-9 12)
LIVEKIT_API_SECRET=$(random_from a-zA-Z0-9 40)
SETUP_CODE=${code:0:4}-${code:4:4}
APP_PORT=$APP_PORT
LIVEKIT_PORT=$LIVEKIT_PORT
RTC_TCP_PORT=$RTC_TCP_PORT
RTC_UDP_PORT=$RTC_UDP_PORT
TURN_UDP_PORT=$TURN_UDP_PORT
TURN_TLS_PORT=$TURN_TLS_PORT
MAX_PARTICIPANTS=${MAX_PARTICIPANTS:-10}
VOXHUB_TAG=$tag
EOF
sed -i '/^$/d' .env
umask 022

chmod +x deploy/voxhub
ln -sf "$DIR/deploy/voxhub" /usr/local/bin/voxhub

# LiveKit wants big UDP buffers: with the default ~200 KB a 1080p60 stream
# drops packets under load.
cat > /etc/sysctl.d/90-voxhub.conf << EOF
net.core.rmem_max = 5000000
net.core.wmem_max = 5000000
EOF
sysctl -q -p /etc/sysctl.d/90-voxhub.conf ||
  warn "Не получилось поднять UDP-буферы — работать будет, но под нагрузкой хуже."

# Nightly: a backup, and picking up a renewed certificate.
cat > /etc/cron.d/voxhub << EOF
15 4 * * * root /usr/local/bin/voxhub backup --quiet > /dev/null 2>&1
30 4 * * * root /usr/local/bin/voxhub refresh-certs > /dev/null 2>&1
EOF

if command -v ufw > /dev/null && ufw status | grep -q 'Status: active'; then
  info "Открываю порты в ufw"
  for p in "$HTTPS_PORT/tcp" "$HTTP_PORT/tcp" "$RTC_TCP_PORT/tcp" "$RTC_UDP_PORT/udp" \
    "$TURN_UDP_PORT/udp" "$TURN_TLS_PORT/tcp"; do
    ufw allow "$p" > /dev/null
  done
fi

# ------------------------------------------------------------------- start

say "5/5 Запуск"

if ! docker compose pull --quiet caddy livekit; then
  if [ ! -f /etc/docker/daemon.json ] &&
    confirm "Docker Hub не отвечает (бывает у российских хостеров). Включить зеркало mirror.gcr.io?"; then
    echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
    systemctl restart docker
    docker compose pull --quiet caddy livekit || die "Образы так и не скачались. Проверь сеть сервера и запусти: cd $DIR && voxhub restart"
  else
    die "Не скачались образы с Docker Hub. Проверь сеть сервера и запусти: cd $DIR && voxhub restart"
  fi
fi

if ! voxhub start; then
  die "Не поднялось за 3 минуты. Что не так — видно в логах: voxhub logs caddy (сертификат), voxhub logs app"
fi

port_suffix=""
[ "$HTTPS_PORT" = 443 ] || port_suffix=":$HTTPS_PORT"
took=$(($(date +%s) - STARTED))

say "Готово за $((took / 60)) мин $((took % 60)) с"
cat << EOF

  Адрес:          https://$DOMAIN$port_suffix
  Код настройки:  $(sed -n 's/^SETUP_CODE=//p' .env)

  Открой адрес, введи код — создашь сервер и свой аккаунт владельца.
  Друзей зови ссылками-приглашениями из настроек.

  Если у хостера в панели есть свой файрвол, открой в нём:
    $HTTPS_PORT/tcp, $HTTP_PORT/tcp, $RTC_TCP_PORT/tcp, $RTC_UDP_PORT/udp, $TURN_UDP_PORT/udp, $TURN_TLS_PORT/tcp

  Дальше:  voxhub status · voxhub update · voxhub backup · voxhub help

EOF
