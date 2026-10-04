#!/bin/sh
# Starts LiveKit with a config built from the environment (compose.yml).
# Runs inside the livekit/livekit-server image (Alpine, busybox sh).
set -eu

: "${DOMAIN:?}" "${NODE_IP:?}" "${LIVEKIT_API_KEY:?}" "${LIVEKIT_API_SECRET:?}"

# TURN over TLS needs a certificate for DOMAIN: your own files, or the one
# Caddy got (it may still be getting it on the very first start).
if [ -n "${TLS_CERT:-}" ]; then
  cert="$TLS_CERT"
  key="$TLS_KEY"
else
  cert=""
  waited=0
  while :; do
    cert=$(find /caddy/caddy/certificates -type f -path "*/$DOMAIN/$DOMAIN.crt" 2>/dev/null | head -n 1)
    [ -n "$cert" ] && break
    if [ $((waited % 60)) -eq 0 ]; then
      echo "[voxhub] waiting for the certificate for $DOMAIN from caddy (docker compose logs caddy)"
    fi
    sleep 5
    waited=$((waited + 5))
  done
  key="${cert%.crt}.key"
fi
echo "[voxhub] TURN certificate: $cert"

# Which local addresses to gather ICE candidates from. Advertising every
# interface hands clients dead paths (a VPN's private IPv6, a second public
# IP that is blocked) and calls fail to connect for some people only.
# - NODE_IP is on an interface (the usual VPS): only that address.
# - It is not (the provider NATs it): the address of the default route, and
#   LiveKit maps it to NODE_IP.
if ip -4 -o addr show | grep -q "inet $NODE_IP/"; then
  local_ip="$NODE_IP"
else
  local_ip=$(ip -4 route get 1.1.1.1 | sed -n 's/.* src \([0-9.]*\).*/\1/p')
fi
echo "[voxhub] public address $NODE_IP, media from local $local_ip"

cat > /tmp/livekit.yaml <<EOF
port: ${LIVEKIT_PORT}
# The API and signalling port is only for the proxy and the app on this box.
bind_addresses:
  - 127.0.0.1

keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}

rtc:
  tcp_port: ${RTC_TCP_PORT}
  # One muxed UDP port instead of a range: with a range clients spend the
  # first second hopping between candidates.
  udp_port: ${RTC_UDP_PORT}
  use_external_ip: false
  node_ip: ${NODE_IP}
  ips:
    includes:
      - ${local_ip}/32

# Relay for people whose network blocks direct UDP. TURN over TLS on its own
# port looks like ordinary HTTPS and gets through almost any filter.
turn:
  enabled: true
  domain: ${DOMAIN}
  cert_file: ${cert}
  key_file: ${key}
  tls_port: ${TURN_TLS_PORT}
  udp_port: ${TURN_UDP_PORT}

room:
  max_participants: ${MAX_PARTICIPANTS}
  empty_timeout: 300
  departure_timeout: 20

logging:
  level: info
EOF

exec /livekit-server --config /tmp/livekit.yaml
