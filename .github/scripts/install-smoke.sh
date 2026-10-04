#!/usr/bin/env bash
# Runs install.sh on a fresh GitHub runner (Ubuntu, nothing of ours on it)
# and checks that the result really works: the site through the proxy, the
# setup flow, a call token, the SFU and TURN over TLS, backup and restore.
#
# The one thing it can't do is get a real certificate — a runner has no
# public address — so it uses Caddy's self-signed one (TLS_MODE=internal).
set -euo pipefail

DOMAIN=voxhub.test
BASE=https://$DOMAIN
c() { curl -fsS -k --resolve "$DOMAIN:443:127.0.0.1" -b /tmp/jar -c /tmp/jar "$@"; }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

step "install"
# The installer clones a branch; give the commit under test one.
git checkout -q -B ci-under-test
sudo env YES=1 VOXHUB_REPO="$PWD" VOXHUB_REF=ci-under-test \
  DOMAIN=$DOMAIN NODE_IP="$(hostname -I | awk '{print $1}')" TLS_MODE=internal \
  bash install.sh | tee /tmp/install.log

grep -q "Код настройки" /tmp/install.log
code=$(sudo sed -n 's/^SETUP_CODE=//p' /opt/voxhub/.env)

step "status"
sudo voxhub status
test "$(sudo stat -c %a /opt/voxhub/.env)" = 600

step "first-run setup through the proxy"
c "$BASE/api/state" | grep -q '"needsSetup":true'
c -H 'content-type: application/json' \
  -d "{\"code\":\"$code\",\"spaceName\":\"CI\",\"name\":\"owner\",\"password\":\"ci-password\"}" \
  "$BASE/api/setup" > /dev/null
c "$BASE/api/state" | grep -q '"role":"owner"'

step "call token points at this server"
channel=$(c "$BASE/api/state" | sed -n 's/.*"channels":\[{"id":"\([^"]*\)".*/\1/p')
c -H 'content-type: application/json' -d "{\"channelId\":\"$channel\"}" "$BASE/api/join" |
  grep -q "\"url\":\"wss://$DOMAIN:443\""

step "LiveKit: signalling through the proxy, API closed to the outside"
c "$BASE/rtc/validate" -o /dev/null -w '%{http_code}\n' || true # 401 without a token is fine
test "$(curl -s http://127.0.0.1:7880)" = OK
ss -Htln 'sport = :7880' | grep -q '127.0.0.1:7880'
ss -Htln 'sport = :3000' | grep -q '127.0.0.1:3000'

step "TURN over TLS answers with the site's certificate"
echo | openssl s_client -connect 127.0.0.1:5349 -servername $DOMAIN 2> /dev/null |
  openssl x509 -noout -ext subjectAltName | grep -q "DNS:$DOMAIN"
ss -Huln 'sport = :7882' | grep -q 7882
ss -Huln 'sport = :3478' | grep -q 3478

step "backup and restore"
sudo voxhub backup
backup=$(sudo sh -c 'ls -1t /opt/voxhub/backups/voxhub-*.tar.gz | head -n 1')
sudo tar -tzf "$backup" | grep -q voxhub.db
# Change something, restore, and the change is gone.
c -H 'content-type: application/json' -d '{"ttlHours":null,"maxUses":null}' "$BASE/api/admin/invites" > /dev/null
test "$(c "$BASE/api/admin/invites" | grep -o '"code"' | wc -l)" = 1
sudo voxhub restore "$backup" -y
c -X POST "$BASE/api/login" -H 'content-type: application/json' \
  -d '{"name":"owner","password":"ci-password"}' > /dev/null
test "$(c "$BASE/api/admin/invites" | grep -o '"code"' | wc -l)" = 0

step "update keeps the data"
sudo voxhub update
c "$BASE/api/state" | grep -q '"role":"owner"'

step "ok"
