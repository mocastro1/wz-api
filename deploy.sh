#!/usr/bin/env bash
# ============================================================
# deploy.sh — Script de bootstrap pra rodar wz-api em producao
# Uso: ./deploy.sh
# ============================================================
set -euo pipefail

cd "$(dirname "$0")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
RESET='\033[0m'

step() { printf "${GREEN}▸${RESET} %s\n" "$1"; }
warn() { printf "${YELLOW}⚠${RESET}  %s\n" "$1"; }
err()  { printf "${RED}✖${RESET}  %s\n" "$1" >&2; exit 1; }

# ── 1. Verifica Docker ──────────────────────────────────────
command -v docker >/dev/null 2>&1 || err "Docker nao encontrado. Instale com: curl -fsSL https://get.docker.com | sh"
docker compose version >/dev/null 2>&1 || err "Docker Compose v2 nao encontrado. Instale: apt install docker-compose-plugin"
step "Docker OK: $(docker --version | awk '{print $3}' | tr -d ',')"

# ── 2. Cria .env se nao existir ─────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  step ".env criado a partir de .env.example"
else
  step ".env ja existe — mantendo"
fi

# ── 3. Gera secrets se ainda forem placeholders ─────────────
if grep -q "GERE_NO_SERVIDOR_COM_openssl_rand_hex_32" .env; then
  TOKEN=$(openssl rand -hex 32)
  sed -i.bak "s|API_BEARER_TOKEN=.*|API_BEARER_TOKEN=${TOKEN}|" .env
  step "API_BEARER_TOKEN gerado"
  echo ""
  warn "COPIE este token para o config.js da extensao Chrome:"
  printf "${YELLOW}    %s${RESET}\n\n" "${TOKEN}"
  read -p "Pressione ENTER apos copiar o token..." _
fi

if grep -q "GERE_NO_SERVIDOR_COM_openssl_rand_base64_32" .env; then
  SECRET=$(openssl rand -base64 32)
  # base64 contem /, +, = — escape para sed
  sed -i.bak "s|NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${SECRET//\//\\/}|" .env
  step "NEXTAUTH_SECRET gerado"
fi

rm -f .env.bak

# ── 4. Valida variaveis obrigatorias ────────────────────────
required=(SF_CLIENT_ID DOMAIN ACME_EMAIL API_BEARER_TOKEN NEXTAUTH_SECRET)
for var in "${required[@]}"; do
  value=$(grep "^${var}=" .env | cut -d= -f2-)
  if [ -z "$value" ] || [[ "$value" == *GERE_NO_SERVIDOR* ]] || [[ "$value" == *COLAR_AQUI* ]]; then
    err ".env: variavel ${var} esta vazia ou com placeholder. Edite .env e rode de novo."
  fi
done
step "Variaveis de ambiente OK"

# ── 5. Build + up ───────────────────────────────────────────
step "Building containers..."
docker compose -f docker-compose.prod.yml build

step "Starting wz-api + caddy..."
docker compose -f docker-compose.prod.yml up -d

# ── 6. Wait for health ──────────────────────────────────────
step "Aguardando API ficar saudavel..."
for i in {1..30}; do
  if docker compose -f docker-compose.prod.yml exec -T wz-api wget -qO- http://localhost:3000/api/health >/dev/null 2>&1; then
    step "API respondeu ao /api/health ✓"
    break
  fi
  printf "."
  sleep 2
  if [ $i -eq 30 ]; then
    err "API nao subiu em 60s. Veja logs: docker compose -f docker-compose.prod.yml logs wz-api"
  fi
done

# ── 7. Resumo ───────────────────────────────────────────────
DOMAIN_VAL=$(grep "^DOMAIN=" .env | cut -d= -f2)
echo ""
echo "═══════════════════════════════════════════════════════════"
step "Deploy OK!"
echo ""
echo "  API:        https://${DOMAIN_VAL}/api/health"
echo "  Logs:       docker compose -f docker-compose.prod.yml logs -f"
echo "  Restart:    docker compose -f docker-compose.prod.yml restart"
echo "  Stop:       docker compose -f docker-compose.prod.yml down"
echo ""
warn "Proximos passos:"
echo "  1. Aguarde 30s a 2min para o Caddy emitir o certificado Let's Encrypt"
echo "  2. Teste: curl https://${DOMAIN_VAL}/api/health"
echo "  3. Atualize o config.js da extensao com o API_BEARER_TOKEN gerado"
echo "  4. Publique a extensao (wz-salesforce-2.7.0.zip)"
echo "═══════════════════════════════════════════════════════════"
