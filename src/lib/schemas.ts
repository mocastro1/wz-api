// ============================================================
// src/lib/schemas.ts — Validação de dados com Zod
// ============================================================

import { z } from 'zod';

export const leadSchema = z.object({
  FirstName: z.string().min(1, 'Nome é obrigatório'),
  LastName: z.string().min(1, 'Sobrenome é obrigatório'),
  Company: z.string().default('Pessoa Física'),
  Phone: z.string().min(8, 'Telefone inválido'),
  MobilePhone: z.string().optional(),
  Status: z.string().default('Novo'),
  LeadSource: z.string().default('Redes sociais do vendedor'),
  Concessionaria_Ref__c: z.string().optional(),
  Interesse_em__c: z.string().optional(),
  Description: z.string().optional(),
  // Campos extras da extensão
  sellerPhone: z.string().optional(),
  conversationSummary: z.string().optional(),
});

export const lookupSchema = z.object({
  phone: z.string().min(8, 'Telefone inválido'),
});

export const contactSchema = z.object({
  FirstName: z.string().min(1),
  LastName: z.string().min(1),
  Phone: z.string().min(8),
  MobilePhone: z.string().optional(),
  Email: z.string().email().optional(),
  Description: z.string().optional(),
  AccountId: z.string().optional(),
});

export const activitySchema = z.object({
  recordId:        z.string().min(15).max(18),
  recordType:      z.enum(['Lead', 'Opportunity']),
  participantName: z.string().min(1),
  reminderDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (YYYY-MM-DD)'),
  reminderTime:    z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida (HH:MM)').default('09:00'),
  description:     z.string().optional(),
});

export const conversationSchema = z.object({
  recordId:         z.string().min(15).max(18),
  recordType:       z.enum(['Lead', 'Opportunity']),
  participantName:  z.string().min(1),
  conversationDate: z.string().optional(), // YYYY-MM-DD (default: hoje)
  messages: z.array(z.object({
    actor: z.enum(['Vendedor', 'Cliente']),
    text:  z.string(),
    time:  z.string().optional(), // HH:MM
  })).min(1, 'Conversa precisa ter ao menos 1 mensagem'),
});

export type LeadInput = z.infer<typeof leadSchema>;
export type LookupInput = z.infer<typeof lookupSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
export type ConversationInput = z.infer<typeof conversationSchema>;
