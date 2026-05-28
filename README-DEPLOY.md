# Deploy wz-api — Quick Start para TI

Guia de 5 minutos para subir a API em produção. Para detalhes completos veja [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Pré-requisitos no servidor

- Ubuntu 22.04 LTS (ou qualquer Linux com Docker)
- Docker Engine + Docker Compose v2
- Portas 80 e 443 abertas inbound
- Subdomínio apontando para o IP do servidor: `wz-api.grupocometa.com.br`

### Instalar Docker (se ainda não tiver)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # logout/login depois
```

---

## Deploy em 3 comandos

```bash
# 1. Clone (ou copie) o projeto
git clone <repo-url> wz-api && cd wz-api

# 2. Rode o script de deploy
chmod +x deploy.sh
./deploy.sh

# 3. O script:
#    - Gera .env a partir de .env.example
#    - Gera API_BEARER_TOKEN e NEXTAUTH_SECRET com openssl
#    - Mostra o API_BEARER_TOKEN na tela (COPIE — precisa pra extensão Chrome)
#    - Builda e sobe os containers (wz-api + caddy)
#    - Aguarda health check
```

---

## Validar deploy

```bash
# Aguarde 30s a 2min para o Caddy emitir certificado Let's Encrypt na primeira vez
curl https://wz-api.grupocometa.com.br/api/health
# Esperado: {"ok":true,"timestamp":"...","version":"..."}
```

---

## Operação

| Ação | Comando |
|---|---|
| Logs em tempo real | `docker compose -f docker-compose.prod.yml logs -f` |
| Restart | `docker compose -f docker-compose.prod.yml restart` |
| Stop | `docker compose -f docker-compose.prod.yml down` |
| Update código | `git pull && docker compose -f docker-compose.prod.yml up -d --build` |
| Ver containers | `docker compose -f docker-compose.prod.yml ps` |

---

## Troubleshooting

### Caddy não emite certificado

- Confirme que `wz-api.grupocometa.com.br` resolve para o IP do servidor: `dig wz-api.grupocometa.com.br`
- Confirme que portas 80 e 443 estão abertas: `sudo ufw status` (ou firewall do cloud provider)
- Logs do Caddy: `docker compose -f docker-compose.prod.yml logs caddy`
- Let's Encrypt tem rate limit — se trocar muito de domínio em curto prazo, pode bloquear por 1 semana

### API retorna 504

- Verifique se `SF_CLIENT_ID` no `.env` é o **de produção** (não sandbox)
- Verifique se `SF_LOGIN_URL=https://cometa.my.salesforce.com` (My Domain de produção)
- Salesforce pode estar lento — veja status em status.salesforce.com

### Extensão retorna 401

- O `API_BEARER_TOKEN` no `.env` precisa ser **idêntico** ao do `config.js` da extensão
- Veja o token: `grep API_BEARER_TOKEN .env`

### CORS bloqueado no DevTools

- Verifique o `ALLOWED_ORIGINS` no `.env` — precisa incluir `chrome-extension://pkmojofnhnmddfpokdgeihencmjggamj`

---

## Arquitetura

```
                            Internet (HTTPS)
                                  │
                            Porta 443
                                  ▼
                        ┌─────────────────┐
                        │  Caddy (proxy)  │  ← HTTPS auto via Let's Encrypt
                        └────────┬────────┘
                                 │ http://wz-api:3000 (rede interna)
                                 ▼
                        ┌─────────────────┐
                        │  wz-api (Next)  │  ← App Router + jsforce
                        └─────────────────┘

```

**Salesforce**: a API conversa diretamente com `cometa.my.salesforce.com` usando o token OAuth do vendedor (cada vendedor faz login na extensão).
