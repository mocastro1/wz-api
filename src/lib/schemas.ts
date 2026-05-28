// ============================================================
// src/lib/schemas.ts — Validação de dados com Zod
// Limites de tamanho alinhados com os limites do Salesforce e
// para evitar payloads abusivamente grandes.
// ============================================================

import { z } from 'zod';

export const leadSchema = z.object({
  FirstName:             z.string().min(1, 'Nome é obrigatório').max(40),
  LastName:              z.string().min(1, 'Sobrenome é obrigatório').max(80),
  Company:               z.string().max(255).default('Pessoa Física'),
  Phone:                 z.string().min(8, 'Telefone inválido').max(40),
  MobilePhone:           z.string().max(40).optional(),
  Status:                z.string().max(255).default('Novo'),
  LeadSource:            z.string().max(255).default('Redes sociais do vendedor'),
  Concessionaria_Ref__c: z.string().max(255).optional(),
  Interesse_em__c:       z.string().max(255).optional(),
  Description:           z.string().max(32000).optional(), // SF: Lead.Description = Long Text 32k
  // Campos extras da extensão
  sellerPhone:           z.string().max(40).optional(),
  conversationSummary:   z.string().max(5000).optional(),
});

export const lookupSchema = z.object({
  phone: z.string().min(8, 'Telefone inválido').max(40),
});

export const activitySchema = z.object({
  recordId:        z.string().min(15).max(18),
  recordType:      z.enum(['Lead', 'Opportunity']),
  participantName: z.string().min(1).max(255),
  reminderDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  reminderTime:    z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida (HH:MM)').default('09:00'),
  description:     z.string().max(32000).optional(),
});

export const conversationSchema = z.object({
  recordId:         z.string().min(15).max(18),
  recordType:       z.enum(['Lead', 'Opportunity']),
  participantName:  z.string().min(1).max(255),
  conversationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida').optional(),
  messages: z.array(z.object({
    actor: z.enum(['Vendedor', 'Cliente']),
    text:  z.string().max(5000),
    time:  z.string().regex(/^\d{2}:\d{2}$/).optional(),
  })).min(1, 'Conversa precisa ter ao menos 1 mensagem').max(500, 'Conversa muito longa'),
});

export type LeadInput = z.infer<typeof leadSchema>;
export type LookupInput = z.infer<typeof lookupSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
export type ConversationInput = z.infer<typeof conversationSchema>;
