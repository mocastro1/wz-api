# Melhorias Identificadas — wz-api + wz-salesforce

Roadmap de melhorias identificadas em junho/2026. Priorizadas por impacto operacional.

---

## 🔴 P0 — Resiliência a Mudanças do WhatsApp DOM

O maior risco do projeto. A extensão Chrome depende de seletores DOM do WhatsApp Web que mudam sem aviso. Hoje, uma mudança = extensão quebrada por dias (novo release + review Chrome Web Store).

### Problema
- Seletores hardcoded em `SEL` object ([content.js:800](../wz-salesforce/content.js#L800))
- Quando Meta renomeia `data-testid`, 15+ seletores podem quebrar de uma vez
- Telemetria já reporta falhas com `liveTestIds` (dump dos data-testid vivos), mas ninguém é alertado
- Correção exige nova release (days)

### Solução (4 camadas)

#### 1️⃣ **Config Remota de Seletores** ⭐ Impacto máximo
Mover `SEL` do hardcode pra um endpoint na API, com cache local e fallback embutido.

**Fluxo:**
```
Extension Boot
  ↓
GET /api/extension/config (cached 6h em chrome.storage.local)
  ├→ sucesso: usa config remota
  └→ falha: usa fallback embutido (config atual)
  
Mudança no WhatsApp
  ↓
Telemetry reporta liveTestIds
  ↓
Dev atualiza JSON em /api/extension/config no servidor
  ↓
Próxima recarga (cache de 6h) → vendedores corrigidos (minutos)
```

**Desenvolvimento:**
- [ ] Nova rota na API: `GET /api/extension/config` (sem auth, cached header)
- [ ] Objeto config: `{ selectorGroups: { header: [...], drawerContainer: [...], ... }, flags: { autoDrawerEnabled, storeHookEnabled }, version: 1 }`
- [ ] Fallback embutido em [content.js](../wz-salesforce/content.js) com `SEL` atual
- [ ] Check remoto no boot da extensão ([content.js startup](../wz-salesforce/content.js#L3280))
- [ ] Cache em `chrome.storage.local` com TTL
- **Tempo:** ~3h | **Risco:** baixo (fallback sempre ativo)

#### 2️⃣ **Alerta Proativo na Telemetria**
Agregar contadores de estratégia usada e avisar antes da quebra total.

**Desenvolvimento:**
- [ ] Backend [background.js:383](../wz-salesforce/background.js#L383): reportar qual estratégia foi usada (store vs drawer vs text-scan vs fallback-dom)
- [ ] Endpoint na API: `POST /api/extension/telemetry/strategy` recebe `{ strategy, source, version, timestamp }`
- [ ] Cron/query diário que detecta: "estratégia X subiu de 5% pra 60% em 24h" → alerta (email ou Slack)
- [ ] Correlacionar com versão do WhatsApp Web (via `window.Debug?.VERSION` no [inject.js](../wz-salesforce/inject.js#L148))
- **Tempo:** ~2h | **Risco:** baixo (puro observability)

#### 3️⃣ **Melhorar Descoberta do Store (Webpack Hook)**
O Store é a maior blindagem — imune a HTML. Investir em mais estratégias de descoberta.

**Desenvolvimento:**
- [ ] Adicionar filters alternativos no [inject.js](../wz-salesforce/inject.js) pra módulos Chat (já tem 2, experimentar ~5)
- [ ] Cache mais agressivo: guardar IDs de módulo em `localStorage` com revisão de versão
- [ ] Se Store não achado em 50s, reportar com detalhe (logs de tentativas)
- **Tempo:** ~2h | **Risco:** médio (requer teste extensivo)

#### 4️⃣ **Smoke Test Noturno** (opcional)
Garantia automática de que a detecção de telefone ainda funciona.

**Setup:**
- Playwright/Puppeteer + number WhatsApp dedicado de teste
- Nightly: abre conversa → valida FAB e telefone detectado
- Falha → alerta automático + Slack
- **Tempo:** ~4h initial + 30min/semana manutenção | **ROI:** alto (detecção de bugs 24h antes do usuário)

---

## 🔴 P1 — Testes Automatizados

Hoje: zero cobertura. Qualquer mudança é um risco cego. As funções críticas de segurança (`normalizePhone`, `sanitizeSfId`, `sanitizeSoqlString`) carecem de validação.

### Camada 1 — Funções Puras (fácil, máx ROI)
Testar `src/lib/salesforce.ts` — funções isoladas sem I/O.

**Escopo:**
- `normalizePhone` — 4+ casos (dígitos diferentes, formatação)
- `sanitizeSfId` — rejeita malformados, IDs inválidos
- `sanitizeSoqlString` — aspas, wildcards, escape order
- `phoneSoslVariants` — gera variantes corretas
- `sanitizeSoqlString` — ordem de escapeamento (backslash antes de aspa)

**Desenvolvimento:**
- [ ] Instalar Vitest: `npm install -D vitest @vitest/coverage-v8`
- [ ] Criar [src/lib/salesforce.test.ts](../wz-api/src/lib/salesforce.test.ts)
- [ ] Escrever 20+ casos (1h)
- [ ] CI: rodar `npm test` em todo PR (30min)
- **Tempo:** ~2h | **Risco:** zero | **Cobertura de segurança:** 🔒🔒🔒

**Exemplo de teste:**
```typescript
describe('normalizePhone', () => {
  it('insere o 9 em número de 12 dígitos', () => {
    expect(normalizePhone('556792265014')).toBe('5567992265014');
  });
  
  it('rejeita ID com injection SQL', () => {
    expect(sanitizeSfId("' OR 1=1 --")).toBe('');
  });
});
```

### Camada 2 — Rotas da API (contrato HTTP)
Testar [/api/leads](../wz-api/src/app/api/leads/route.ts) sem chamar Salesforce de verdade.

**Escopo:**
- POST /api/leads → 201 (dados válidos), 401 (token), 422 (validation), 502 (SF timeout)
- GET /api/leads (listagem — se implementado)
- Mock jsforce.Connection para evitar chamadas reais

**Desenvolvimento:**
- [ ] [src/app/api/leads/route.test.ts](../wz-api/src/app/api/leads/route.test.ts) com vi.mock('jsforce')
- [ ] 6–8 casos (happy path, erros, bordas)
- [ ] Replicar para `/api/conversations`, `/api/activities` (2h total)
- **Tempo:** ~3h | **Risco:** baixo (já temos padrão no Camada 1) | **Cobertura:** contratos API

### Camada 3 — Extensão Chrome (funções puras apenas)
Telefone normalizado é duplicado em [content.js](../wz-salesforce/content.js#L35) e aqui.

**Escopo:**
- Extrair `normalizePhoneBR`, `formatPhoneDisplay` pra [wz-salesforce/utils.js](../wz-salesforce/utils.js)
- Testar via Jest/Vitest

**Desenvolvimento:**
- [ ] Novo arquivo [utils.js](../wz-salesforce/utils.js) com funções puras
- [ ] [utils.test.js](../wz-salesforce/utils.test.js) com Jest
- [ ] Não testar seletores DOM (mutável, alto custo)
- **Tempo:** ~1h | **Risco:** zero | **Nota:** extensão sobrevive mudança de DOM com telemetria, não precisa 100% cobertura

### Roadmap Testes
| Semana | Tarefa | Esforço | Bloqueante? |
|--------|--------|--------|------------|
| +1 | Camada 1 (funções puras) | 2h | não |
| +1 | Camada 2 (rotas API) | 3h | não |
| +2 | Camada 3 (extensão utils) | 1h | não |
| +2 | CI: GitHub Actions `npm test` | 30min | não |
| +2 | Cobertura mínima 80% | 2h | não |

---

---

## 🟢 P3 — Logging Persistente (Nice to Have)

Hoje: logs circulares em memória no servidor ([lib/logger.ts](../wz-api/src/lib/logger.ts)), perdem-se na reinicialização.

**Opções:**
1. Arquivo no container (Next.js standalone permite)
2. Envio pra Loki/Grafana Cloud (free tier)
3. Table no banco (adiciona dependência)

**Não urgent** (hoje a telemetria já está em memória e funciona pro debug imediato), mas considerar após P0/P1.

---

## 🟢 P4 — Divisão de content.js

[content.js](../wz-salesforce/content.js) tem ~3.300 linhas. Funciona, mas conforme features crescem vira difícil de manter.

**Sugestão (após P0/P1 estáveis):**
```
content.js (index, inicia)
├── fab.js (painel + interação)
├── lead-lookup.js (busca SF, cache, debounce)
├── drawer.js (auto-open, extração)
├── contact-info.js (extractContactInfo, estratégias)
├── store-handler.js (requestStoreData, mensagens)
└── telemetry.js (reportTelemetry, batching)
```

**Tempo:** ~8h refactor | **ROI:** médio | **Timeline:** Q3 2026

---

## 📋 Checklist Geral

### API (wz-api)
- [ ] Config remota de seletores (`GET /api/extension/config`)
- [ ] Telemetry aggregation + alertas (`POST /api/extension/telemetry/strategy`)
- [ ] Testes Camada 1 (funções puras)
- [ ] Testes Camada 2 (rotas API)
- [ ] CI: `npm test` em PRs
- [ ] Logging persistente (opcional, Q3)

### Extensão (wz-salesforce)
- [ ] ✅ Tela de anexo — pausa durante modal
- [ ] Melhorar descoberta do Store (webpack hook)
- [ ] Extrair utils.js com funções puras
- [ ] Testes Camada 3
- [ ] Smoke test noturno (opcional, Q3)

### Documentação
- [ ] Este arquivo (IMPROVEMENTS.md) ✅
- [ ] Guia de configuração remota (quando implementar P0.1)
- [ ] Playbook de escalação (quebra de seletores)

---

## Priorização Recomendada

**Semanas 1–2 (impacto crítico):**
1. Testes Camada 1 + Camada 2 (2 devs, 5h total)
2. CI setup (30min)
3. Config remota de seletores (3h)

**Semanas 3–4 (detectabilidade):**
1. Alerta proativo de telemetria (2h)
2. Melhorar descoberta do Store (2h)
3. Testes Camada 3 (1h)

**Opcional Q3:**
1. Smoke test (4h initial)
2. Logging persistente (2h)
3. Refactor content.js (8h)

---
