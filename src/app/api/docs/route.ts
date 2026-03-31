import { NextResponse } from 'next/server';

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'WZ API — WhatsApp → Salesforce BFF',
    description: 'Backend for Frontend que faz a ponte entre a extensão Chrome (WhatsApp Web) e o Salesforce CRM.',
    version: '2.2.0',
    contact: { name: 'Equipe WZ / Inovação' },
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Desenvolvimento' },
  ],
  components: {
    securitySchemes: {
      BearerToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'API_BEARER_TOKEN compartilhado com a extensão Chrome',
      },
      SFAccessToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-SF-Access-Token',
        description: 'OAuth access_token do Salesforce',
      },
      SFInstanceUrl: {
        type: 'apiKey',
        in: 'header',
        name: 'X-SF-Instance-Url',
        description: 'URL da instância Salesforce (ex: https://org.my.salesforce.com)',
      },
    },
    schemas: {
      SuccessBase: {
        type: 'object',
        properties: { ok: { type: 'boolean', example: true } },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string' },
        },
      },
      LeadInput: {
        type: 'object',
        required: ['FirstName', 'LastName', 'Phone'],
        properties: {
          FirstName: { type: 'string', minLength: 1, example: 'João' },
          LastName: { type: 'string', minLength: 1, example: 'Silva' },
          Company: { type: 'string', default: 'Pessoa Física' },
          Phone: { type: 'string', minLength: 8, example: '5565999887766' },
          MobilePhone: { type: 'string' },
          Status: { type: 'string', default: 'Novo' },
          LeadSource: { type: 'string', default: 'Redes sociais do vendedor' },
          Concessionaria_Ref__c: { type: 'string' },
          Interesse_em__c: { type: 'string' },
          Description: { type: 'string' },
          sellerPhone: { type: 'string' },
          conversationSummary: { type: 'string' },
        },
      },
      LeadCreated: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          leadId: { type: 'string', example: '00Q1a000000dJJHEA2' },
          message: { type: 'string', example: 'Lead criado com sucesso' },
        },
      },
      LookupInput: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', minLength: 8, example: '5565999887766' },
        },
      },
      LookupResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          found: { type: 'boolean' },
          count: { type: 'integer' },
          leads: {
            type: 'array',
            items: { $ref: '#/components/schemas/LeadResult' },
          },
        },
      },
      LeadResult: {
        type: 'object',
        properties: {
          leadId: { type: 'string' },
          leadName: { type: 'string' },
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          mobilePhone: { type: 'string' },
          leadStatus: { type: 'string' },
          leadSource: { type: 'string' },
          company: { type: 'string' },
          ownerId: { type: 'string' },
          ownerName: { type: 'string' },
          leadUrl: { type: 'string', format: 'uri' },
          isConverted: { type: 'boolean' },
          opportunityId: { type: 'string', nullable: true },
          motivoPerda: { type: 'string', nullable: true },
          encerrado: { type: 'boolean' },
          opportunity: {
            nullable: true,
            $ref: '#/components/schemas/OpportunityInfo',
          },
        },
      },
      OpportunityInfo: {
        type: 'object',
        properties: {
          oppId: { type: 'string' },
          oppName: { type: 'string' },
          stageName: { type: 'string' },
          cotacaoFaturada: { type: 'boolean' },
          motivoPerda: { type: 'string', nullable: true },
          amount: { type: 'number', nullable: true },
          closeDate: { type: 'string', format: 'date' },
          ownerId: { type: 'string' },
          ownerName: { type: 'string' },
          oppUrl: { type: 'string', format: 'uri' },
        },
      },
      PicklistResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          field: { type: 'string', example: 'Interesse_em__c' },
          values: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                value: { type: 'string' },
                label: { type: 'string' },
              },
            },
          },
        },
      },
      ContactInput: {
        type: 'object',
        required: ['FirstName', 'LastName', 'Phone'],
        properties: {
          FirstName: { type: 'string', minLength: 1 },
          LastName: { type: 'string', minLength: 1 },
          Phone: { type: 'string', minLength: 8 },
          MobilePhone: { type: 'string' },
          Email: { type: 'string', format: 'email' },
          Description: { type: 'string' },
          AccountId: { type: 'string' },
        },
      },
      ConversationInput: {
        type: 'object',
        required: ['phone', 'contactName'],
        properties: {
          phone: { type: 'string', minLength: 8 },
          contactName: { type: 'string', minLength: 1 },
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                from: { type: 'string' },
                text: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
              },
              required: ['from', 'text'],
            },
          },
          summary: { type: 'string' },
          leadId: { type: 'string' },
        },
      },
      ActivityInput: {
        type: 'object',
        required: ['Subject'],
        properties: {
          Subject: { type: 'string', minLength: 1 },
          Description: { type: 'string' },
          WhoId: { type: 'string' },
          WhatId: { type: 'string' },
          ActivityDate: { type: 'string', format: 'date' },
          Priority: { type: 'string', enum: ['High', 'Normal', 'Low'], default: 'Normal' },
          Status: { type: 'string', enum: ['Not Started', 'In Progress', 'Completed', 'Waiting on someone else', 'Deferred'], default: 'Not Started' },
          Type: { type: 'string', default: 'WhatsApp' },
        },
      },
      AuthCheckResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          authenticated: { type: 'boolean' },
          userId: { type: 'string' },
          userName: { type: 'string' },
          orgId: { type: 'string' },
          concessionariaRef: { type: 'string' },
        },
      },
      LogEntry: {
        type: 'object',
        properties: {
          timestamp: { type: 'string', format: 'date-time' },
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'fail', 'done'] },
          route: { type: 'string' },
          message: { type: 'string' },
          data: { type: 'object' },
        },
      },
    },
  },
  security: [
    { BearerToken: [], SFAccessToken: [], SFInstanceUrl: [] },
  ],
  paths: {
    '/api/health': {
      get: {
        tags: ['Sistema'],
        summary: 'Health check',
        description: 'Verifica se a API está online. Não requer autenticação.',
        security: [],
        responses: {
          200: {
            description: 'API online',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, status: { type: 'string' }, version: { type: 'string' }, timestamp: { type: 'string' }, services: { type: 'object' } } } } },
          },
        },
      },
    },
    '/api/leads': {
      post: {
        tags: ['Leads'],
        summary: 'Criar Lead',
        description: 'Cria um novo Lead no Salesforce.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadInput' } } },
        },
        responses: {
          201: { description: 'Lead criado', content: { 'application/json': { schema: { $ref: '#/components/schemas/LeadCreated' } } } },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { description: 'Dados inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/leads/lookup': {
      post: {
        tags: ['Leads'],
        summary: 'Buscar Lead por telefone',
        description: 'Busca leads no Salesforce que correspondam ao número de telefone (últimos 11 dígitos). Inclui dados de Opportunity vinculada se convertido.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LookupInput' } } },
        },
        responses: {
          200: { description: 'Resultado da busca', content: { 'application/json': { schema: { $ref: '#/components/schemas/LookupResponse' } } } },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { description: 'Dados inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/leads/picklist': {
      get: {
        tags: ['Leads'],
        summary: 'Valores de picklist do Lead',
        description: 'Retorna os valores ativos de um campo picklist do objeto Lead, carregados dinamicamente via `describe` do Salesforce.',
        parameters: [
          { name: 'field', in: 'query', required: true, schema: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]*$' }, description: 'Nome do campo picklist (ex: Interesse_em__c)', example: 'Interesse_em__c' },
        ],
        responses: {
          200: { description: 'Valores do picklist', content: { 'application/json': { schema: { $ref: '#/components/schemas/PicklistResponse' } } } },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          404: { description: 'Campo não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { description: 'Parâmetro inválido', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/leads/{id}': {
      get: {
        tags: ['Leads'],
        summary: 'Buscar Lead por ID',
        description: 'Retorna os dados de um Lead pelo Salesforce ID.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Salesforce Lead ID (15 ou 18 caracteres)' },
        ],
        responses: {
          200: { description: 'Lead encontrado', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, lead: { type: 'object' } } } } } },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      patch: {
        tags: ['Leads'],
        summary: 'Atualizar Lead',
        description: 'Atualiza campos de um Lead existente no Salesforce.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Salesforce Lead ID' },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { type: 'object', additionalProperties: true, description: 'Campos do Lead a atualizar' } } },
        },
        responses: {
          200: { description: 'Lead atualizado', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, message: { type: 'string' }, leadId: { type: 'string' } } } } } },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/contacts': {
      post: {
        tags: ['Contatos'],
        summary: 'Criar Contato',
        description: 'Cria um novo Contact no Salesforce.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ContactInput' } } },
        },
        responses: {
          201: { description: 'Contato criado', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, contactId: { type: 'string' }, message: { type: 'string' } } } } } },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { description: 'Dados inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/conversations': {
      post: {
        tags: ['Conversas'],
        summary: 'Registrar conversa WhatsApp',
        description: 'Registra uma conversa do WhatsApp como Task no Salesforce, vinculada a um Lead existente (buscado por telefone).',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ConversationInput' } } },
        },
        responses: {
          201: { description: 'Conversa registrada', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, taskId: { type: 'string' }, leadId: { type: 'string', nullable: true }, message: { type: 'string' } } } } } },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { description: 'Dados inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/activities': {
      post: {
        tags: ['Atividades'],
        summary: 'Criar Atividade (Task)',
        description: 'Cria uma Task no Salesforce. Pode ser vinculada a Lead/Contact via WhoId.',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ActivityInput' } } },
        },
        responses: {
          201: { description: 'Atividade criada', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, activityId: { type: 'string' }, message: { type: 'string' } } } } } },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
          422: { description: 'Dados inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/auth/check': {
      get: {
        tags: ['Autenticação'],
        summary: 'Verificar autenticação SF',
        description: 'Valida o token Salesforce e retorna dados do usuário (nome, ID, concessionária).',
        responses: {
          200: { description: 'Status da autenticação', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthCheckResponse' } } } },
          401: { description: 'Token da API inválido', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
    '/api/logs': {
      get: {
        tags: ['Sistema'],
        summary: 'Listar logs',
        description: 'Retorna os logs em memória da API (buffer circular de 200 entradas).',
        parameters: [
          { name: 'level', in: 'query', schema: { type: 'string', enum: ['debug', 'info', 'warn', 'error', 'fail', 'done'] }, description: 'Filtrar por nível' },
          { name: 'last', in: 'query', schema: { type: 'integer', default: 100 }, description: 'Número de logs recentes' },
        ],
        responses: {
          200: {
            description: 'Logs da API',
            content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, count: { type: 'integer' }, logs: { type: 'array', items: { $ref: '#/components/schemas/LogEntry' } } } } } },
          },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
      delete: {
        tags: ['Sistema'],
        summary: 'Limpar logs',
        description: 'Remove todos os logs do buffer em memória.',
        responses: {
          200: { description: 'Logs limpos', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' }, message: { type: 'string' } } } } } },
          401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
        },
      },
    },
  },
  tags: [
    { name: 'Leads', description: 'Operações com Leads no Salesforce' },
    { name: 'Contatos', description: 'Operações com Contacts no Salesforce' },
    { name: 'Conversas', description: 'Registro de conversas WhatsApp como Tasks' },
    { name: 'Atividades', description: 'Criação de Tasks/Atividades' },
    { name: 'Autenticação', description: 'Verificação de autenticação Salesforce' },
    { name: 'Sistema', description: 'Health check e logs' },
  ],
};

export async function GET() {
  return NextResponse.json(spec, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
