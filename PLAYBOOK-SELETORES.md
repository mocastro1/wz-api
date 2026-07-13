# Playbook — WhatsApp mudou e a extensão quebrou

Guia de emergência para quando o WhatsApp Web muda os `data-testid`/HTML e a
extensão WZ Conecta para de detectar telefone/contato. Com a config remota,
a correção é **editar um JSON e mergear na main** — o pipeline do GitLab
deploya sozinho. Sem release na Chrome Web Store, sem esperar review do Google.

> Validado em produção (jul/2026): quebra simulada de todos os grupos de
> seletores derrubou a detecção da extensão; o conserto via config remota
> restaurou tudo sem tocar na extensão instalada.

## 1. Confirmar o sintoma

Sinais típicos: FAB não aparece ou fica cinza, telefone/nome não detectados,
console sem as linhas "Conversa mudou para:", telemetria com volume alto de
`selector_fallback` / `extraction_failed`.

Ver telemetria (do seu terminal, com o token admin):

```bash
curl -s "https://wzapi.viacometa.com.br/api/telemetry?limit=50" \
  -H "Authorization: Bearer $LOGS_ADMIN_TOKEN" | jq .
```

Procure eventos `extraction_failed` — o campo `detail.liveTestIds` traz os
`data-testid` **vivos** na página do vendedor. É a matéria-prima da correção.

## 2. Descobrir o seletor novo

Compare os `liveTestIds` com os grupos em `config/extension-config.json`.
Exemplo: se `conversation-header` sumiu e apareceu `chat-main-header`,
o grupo `header` precisa do seletor novo.

Se a telemetria não bastar: abra `web.whatsapp.com`, F12 → Elements, inspecione
o elemento (nome do contato, header etc.) e copie o `data-testid` atual.

## 3. Corrigir (a parte que resolve)

No repositório `wz-api`:

```bash
git checkout main && git pull
git checkout -b fix/seletores-whatsapp
# editar config/extension-config.json
git add config/extension-config.json
git commit -m "fix(config): novo seletor X apos mudanca do WhatsApp"
git push viacometa fix/seletores-whatsapp
```

Regras ao editar o JSON:

- **Adicione** o seletor novo no INÍCIO da lista do grupo afetado
  (a extensão testa na ordem). **Não remova** os antigos — são fallback.
- Incremente o campo `version` e atualize `updatedAt`.

Depois: abrir o MR no GitLab → **Merge na main** → o pipeline `helms/deploy`
sobe sozinho (alguns minutos).

Validar que a API está servindo a config nova:

```bash
curl -s https://wzapi.viacometa.com.br/api/extension/config | jq .config.version
```

Se retornar erro 500, o JSON ficou inválido (vírgula sobrando etc.) — corrija.
Enquanto isso a extensão segue no fallback embutido; nada piora.

## 4. Propagação aos vendedores

A extensão busca a config no boot, com cache de **6h**. Ou seja: em até 6h
(na prática, na próxima vez que o vendedor recarregar o WhatsApp Web) todos
estarão corrigidos. Para acelerar num vendedor específico: F5 no WhatsApp Web
resolve se o cache já venceu; para forçar, `chrome://extensions` → recarregar
a extensão.

## 5. Confirmar recuperação

Na telemetria, os eventos `strategy_used`/`store_found` voltam ao normal e
`extraction_failed` some. O evento `config_source` mostra `remote` com a
`version` nova — confirmação de que a config chegou.

## 6. Limites deste playbook

- Este fluxo cobre o caso comum: **seletor mudou**. Se a mudança do WhatsApp
  exigir lógica nova (estrutura de página diferente, fluxo novo), aí é release
  da extensão na Chrome Web Store (bump de versão + review do Google).
- Tempo total esperado numa emergência: **~15–30 min** (descobrir seletor +
  commit + merge + pipeline), contra 1–3 dias do fluxo via loja.
