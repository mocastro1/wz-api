# ⚡ WZ API — Backend for Frontend (BFF)

BFF em **Next.js** que faz a ponte entre a extensão Chrome (WhatsApp → Salesforce) e a API do Salesforce, substituindo o n8n como middleware.

## Stack

| Tecnologia | Função |
|---|---|
| **Next.js 14** | API Routes como endpoints REST |
| **jsforce** | Biblioteca oficial Node.js para Salesforce (OAuth, SOQL, CRUD) |
| **NextAuth.js** | OAuth 2.0 com Salesforce (sessões server-side) |
| **Zod** | Validação de dados de entrada |
| **Vercel / Docker** | Deploy recomendado |

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `POST` | `/api/leads` | Criar Lead |
| `POST` | `/api/leads/lookup` | Buscar Lead por telefone |
| `GET` | `/api/leads/:id` | Buscar Lead por ID |
| `PATCH` | `/api/leads/:id` | Atualizar Lead |
| `POST` | `/api/contacts` | Criar Contato |
| `POST` | `/api/activities` | Criar Task/Atividade |
| `POST` | `/api/conversations` | Registrar conversa WhatsApp |
| `GET` | `/api/leads/picklist` | Valores de picklist do Lead |
| `GET` | `/api/auth/check` | Verificar autenticação SF |
| `*` | `/api/auth/[...nextauth]` | OAuth Salesforce (NextAuth) |

## Setup

### 1. Instalar dependências

```bash
cd wz-api
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```env
SF_CLIENT_ID=seu_client_id_da_connected_app
SF_CLIENT_SECRET=seu_client_secret
SF_LOGIN_URL=https://test.salesforce.com
SF_API_VERSION=v59.0

NEXTAUTH_SECRET=gere-com-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000

API_BEARER_TOKEN=token-secreto-compartilhado-com-extensao
```

### 3. Rodar em desenvolvimento

```bash
npm run dev
```

A API estará disponível em `http://localhost:3000`.

### 4. Build e produção

```bash
npm run build
npm start
```

### 5. Deploy com Docker

```bash
# Build e start
docker compose up -d --build

# Ou build manual
docker build -t wz-api .
docker run -d -p 3000:3000 --env-file .env wz-api
```

## Autenticação

### Via extensão Chrome (token passado por request)

A extensão já possui o `access_token` do Salesforce (OAuth User-Agent Flow). Ela envia este token para a API via **headers**:

```
X-SF-Access-Token: <token>
X-SF-Instance-Url: https://sua-org.my.salesforce.com
Authorization: Bearer <API_BEARER_TOKEN>
```

### Via NextAuth (login server-side)

Para um painel admin ou dashboard futuro, o NextAuth gerencia OAuth completo com refresh tokens:

```
GET /api/auth/signin  → Tela de login Salesforce
GET /api/auth/session → Sessão atual
```

## Exemplos de uso

### Criar Lead

```bash
curl -X POST http://localhost:3000/api/leads \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token-secreto" \
  -H "X-SF-Access-Token: 00D..." \
  -H "X-SF-Instance-Url: https://cometa--crm.sandbox.my.salesforce.com" \
  -d '{
    "FirstName": "João",
    "LastName": "Silva",
    "Phone": "556592988342",
    "Company": "Pessoa Física",
    "LeadSource": "WhatsApp"
  }'
```

### Buscar Lead por telefone

```bash
curl -X POST http://localhost:3000/api/leads/lookup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token-secreto" \
  -H "X-SF-Access-Token: 00D..." \
  -H "X-SF-Instance-Url: https://cometa--crm.sandbox.my.salesforce.com" \
  -d '{ "phone": "556592988342" }'
```

### Health check

```bash
curl http://localhost:3000/api/health
```

## Estrutura

```
wz-api/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── activities/route.ts    — POST Task
│   │   │   ├── auth/
│   │   │   │   ├── check/route.ts     — GET auth check
│   │   │   │   └── [...nextauth]/route.ts — OAuth
│   │   │   ├── contacts/route.ts      — POST Contact
│   │   │   ├── conversations/route.ts — POST conversa
│   │   │   ├── health/route.ts        — GET health
│   │   │   ├── leads/
│   │   │   │   ├── route.ts           — POST criar Lead
│   │   │   │   ├── lookup/route.ts    — POST buscar por tel
│   │   │   │   ├── picklist/route.ts   — GET picklist values
│   │   │   │   └── [id]/route.ts      — GET/PATCH Lead
│   │   │   └── logs/route.ts          — GET/DELETE logs
│   │   ├── layout.tsx
│   │   └── page.tsx
│   └── lib/
│       ├── api-middleware.ts  — CORS, auth, helpers
│       ├── salesforce.ts      — jsforce client, phone utils
│       └── schemas.ts         — Zod validation schemas
├── .env.example
├── next.config.js
├── package.json
└── tsconfig.json
```

## Segurança

- **Bearer token** obrigatório em todas as rotas (exceto health)
- **Credenciais SF** via headers dedicados (nunca no body em produção)
- **Sanitização SOQL** — `sanitizeSfId()` e `sanitizeSoqlString()` previnem injeção
- **Zod** — valida todos os payloads antes de enviar ao Salesforce
- **CORS restrito** — aceita apenas extensões Chrome e localhost (configurável)
- **Rota `/api/soql` removida** — elimina vetor de risco de SOQL genérica
