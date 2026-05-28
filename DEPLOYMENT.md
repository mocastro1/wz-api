# Deploy — wz-api

Guia para subir a API em produção e manter a integração com a extensão Chrome (`wz-salesforce`).

---

## 📋 Pré-requisitos

- **Node.js >= 20** (`engines.node` em `package.json`)
- **Connected App no Salesforce** configurada (ver seção "Salesforce")
- **Domínio HTTPS** onde a API vai rodar (ex: `https://wz-api.grupocometa.com.br`)
- **Acesso à extensão** publicada (Chrome Web Store) ou instalação interna

---

## 🔐 Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

| Variável | Descrição | Como gerar |
|----------|-----------|-----------|
| `SF_LOGIN_URL` | `https://test.salesforce.com` (sandbox) ou `https://login.salesforce.com` (prod) | — |
| `SF_API_VERSION` | `v59.0` | — |
| `API_BEARER_TOKEN` | Token compartilhado com a extensão | `openssl rand -hex 32` |
| `ALLOWED_ORIGINS` | Origens permitidas no CORS, separadas por vírgula | Ver abaixo |
| `NEXTAUTH_SECRET` | Chave para NextAuth (se usar) | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | URL pública da API | `https://wz-api.grupocometa.com.br` |

### `ALLOWED_ORIGINS`

Precisa incluir o ID fixo da extensão e o domínio web (se houver):

```
ALLOWED_ORIGINS=chrome-extension://pkmojofnhnmddfpokdgeihencmjggamj,https://app.grupocometa.com.br
```

**Importante:** quando criar uma nova versão da extensão com ID diferente, atualize aqui.

---

## ☁️ Salesforce Connected App

A extensão usa OAuth 2.0 (Web Server Flow + PKCE) para autenticar cada vendedor.

### Setup → App Manager → sua app → Edit

**OAuth Settings:**
- ✅ Habilitar OAuth Settings
- **Callback URL:**
  ```
  https://pkmojofnhnmddfpokdgeihencmjggamj.chromiumapp.org/salesforce
  ```
- **Escopos selecionados:**
  - `Manage user data via APIs (api)`
  - `Access the identity URL service (id, profile...)`
  - `Access Chatter (chatter_api)`
  - `Perform requests at any time (refresh_token, offline_access)` ← essencial

**Security (Habilitar configurações do OAuth → seção Segurança):**
- ❌ "Exigir segredo para o Fluxo de servidor da web" — **DESMARCADO**
- ❌ "Exigir segredo para atualizar o fluxo de tokens" — **DESMARCADO**
- ✅ "Exigir Proof Key for Code Exchange (PKCE)" — **MARCADO**

> A extensão é cliente público (não consegue guardar secret). O PKCE substitui o secret com segurança.

**Refresh Token Policy** (em "Manage Connected App" → OAuth Policies):
- "Refresh token is valid until revoked" (ou expira em X dias, conforme política da empresa)

A propagação das mudanças leva ~2–10 minutos.

---

## 🐳 Deploy com Docker (recomendado)

A API tem `Dockerfile` multi-stage e `docker-compose.yml` prontos.

```bash
# 1. Build da imagem
docker compose build

# 2. Subir (lê .env automaticamente)
docker compose up -d

# 3. Verificar
curl https://wz-api.seudominio/api/health
```

### Por trás de proxy reverso (Nginx, Traefik, Caddy)

- Garanta que o proxy repassa o header `X-Forwarded-For` (rate limit usa pra identificar IP)
- Configure HTTPS no proxy (o Next.js dentro do container roda em HTTP na porta 3000)
- Exemplo Nginx:
  ```nginx
  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Host $host;
  }
  ```

---

## ▲ Deploy no Vercel (alternativa)

1. Conecte o repositório em vercel.com
2. Configure as variáveis de ambiente (todas do `.env.example`)
3. O `next.config.js` já tem `output: 'standalone'`, mas Vercel ignora isso
4. Após o primeiro deploy, anote a URL final e atualize `ALLOWED_ORIGINS`

---

## 🔌 Extensão Chrome (wz-salesforce)

Após a API estar no ar, **atualize a extensão**:

### 1. `config.js`
```js
const API_CONFIG = {
  baseUrl: 'https://wz-api.seudominio.com.br', // ← URL final
  apiToken: 'PRODUCAO_TOKEN_AQUI',             // ← mesmo do API_BEARER_TOKEN
  // ...
};
```

### 2. `manifest.json`
Adicione o domínio em `host_permissions` e remova `localhost`:
```json
"host_permissions": [
  "https://web.whatsapp.com/*",
  "https://wz-api.seudominio.com.br/*",
  "https://cometa--crm.sandbox.lightning.force.com/*",
  "https://cometa--crm.sandbox.my.salesforce.com/*",
  "https://test.salesforce.com/*",
  "https://*.salesforce.com/*"
]
```

### 3. Republicar
- Bump da versão em `manifest.json` (ex: `2.6.0` → `2.7.0`)
- Empacote: `zip -r wz-salesforce-2.7.0.zip .` (na pasta da extensão)
- Suba na Chrome Web Store (ou distribua o `.zip` se for uso interno)

Como o **ID está fixo** (campo `key` no manifest), os usuários só recebem o update — não precisam re-instalar.

---

## ✅ Pós-deploy: checklist

- [ ] `curl https://api/api/health` → `{"ok":true}`
- [ ] CORS responde ao OPTIONS da extensão sem erro
- [ ] Login OAuth funciona ponta a ponta (faça login + lookup + criar lead)
- [ ] Lookup retorna leads ativos
- [ ] Desqualificação persiste no SF
- [ ] Logs estão sendo gravados (`/api/logs` com Bearer token)
- [ ] Rate limit dispara quando excede (teste com loop simples)
- [ ] Timeout retorna 504 (simule cortando rede pro SF momentaneamente)

---

## 🚨 Troubleshooting

| Sintoma | Causa provável | Solução |
|---------|---------------|---------|
| `invalid client credentials` no login | "Exigir segredo" marcado na Connected App | Desmarcar os dois "Exigir segredo" |
| CORS bloqueado no DevTools | Origem da extensão fora de `ALLOWED_ORIGINS` | Adicionar `chrome-extension://{ID}` |
| `Sem refresh token — faça login` | Escopo `refresh_token` faltando na app | Marcar escopo + relogin |
| 504 em todas as chamadas | SF lento ou indisponível | Verificar status.salesforce.com |
| 429 com vários usuários | Rate limit muito baixo | Ajustar `RL.write.max` em `src/lib/rate-limit.ts` |
| Lookup não encontra lead recém criado | Cache de duplicate na extensão | Limpar `wzsf_sent_cache` no storage |

---

## 📊 Observabilidade

- **Logs em memória:** acessíveis em `GET /api/logs` com `Authorization: Bearer {API_BEARER_TOKEN}` (buffer circular de 200 entradas)
- **Healthcheck:** `GET /api/health` (sem auth)
- **Telemetria da extensão:** chega em `POST /api/telemetry` e é registrada no logger

Para produção séria, considere exportar os logs para um agregador externo (Datadog, CloudWatch, etc).

---

## 🔄 Atualizações futuras

Quando subir nova versão:

1. `git pull && npm ci`
2. Se mudou `.env.example`, atualizar `.env`
3. `docker compose build && docker compose up -d` (ou redeploy no Vercel)
4. Se mudou contrato com a extensão, bump versão em `wz-salesforce/manifest.json` e republicar
