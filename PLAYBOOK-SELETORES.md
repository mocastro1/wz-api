# Playbook — WhatsApp mudou e a extensão quebrou

Guia de emergência para quando o WhatsApp Web muda os `data-testid`/HTML e a
extensão WZ Conecta para de detectar telefone/contato. Com a config remota,
a correção é **editar um JSON no servidor** — sem release, sem Chrome Web Store.

## 1. Confirmar o sintoma

Sinais típicos: FAB não aparece ou fica cinza, telefone não detectado,
telemetria com `selector_fallback` / `extraction_failed` em volume alto.

Ver telemetria (do seu terminal, com o token admin do servidor):

```bash
curl -s https://wzapi.viacometa.com.br/api/telemetry?limit=50 \
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

## 3. Corrigir no servidor (a parte que resolve)

```bash
ssh <servidor>
cd /caminho/do/wz-api
nano config/extension-config.json
```

- **Adicione** o seletor novo no INÍCIO da lista do grupo afetado
  (a extensão testa na ordem). **Não remova** os antigos — são fallback.
- Incremente o campo `version` e atualize `updatedAt`.
- Salve. **Não precisa** rebuild/restart — o arquivo é volume montado, a rota
  lê a cada request.

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

## 6. Depois da emergência

- Commitar a mudança do `config/extension-config.json` no repositório
  (o servidor é a fonte da verdade, mas o git guarda o histórico).
- Se a mudança do WhatsApp exigir lógica nova (não só seletor), aí sim é
  release da extensão — este playbook cobre só o caso comum.
