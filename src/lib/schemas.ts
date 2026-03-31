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
  Subject: z.string().min(1, 'Assunto é obrigatório'),
  Description: z.string().optional(),
  WhoId: z.string().optional(),    // Lead/Contact ID
  WhatId: z.string().optional(),   // Account/Opportunity ID
  ActivityDate: z.string().optional(),
  Priority: z.enum(['High', 'Normal', 'Low']).default('Normal'),
  Status: z.enum(['Not Started', 'In Progress', 'Completed', 'Waiting on someone else', 'Deferred']).default('Not Started'),
  Type: z.string().default('WhatsApp'),
});

export const conversationSchema = z.object({
  phone: z.string().min(8),
  contactName: z.string().min(1),
  messages: z.array(z.object({
    from: z.string(),
    text: z.string(),
    timestamp: z.string().optional(),
  })).optional(),
  summary: z.string().optional(),
  leadId: z.string().optional(),
});

export type LeadInput = z.infer<typeof leadSchema>;
export type LookupInput = z.infer<typeof lookupSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type ActivityInput = z.infer<typeof activitySchema>;
export type ConversationInput = z.infer<typeof conversationSchema>;
