// ============================================================
// GET /api/health — Health check da API
// ============================================================

import { handleOptions, jsonOk, corsHeaders } from '@/lib/api-middleware';
import { NextResponse } from 'next/server';

export async function OPTIONS() {
  return handleOptions();
}

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        api: 'running',
        salesforce: 'proxy-ready',
      },
    },
    { headers: corsHeaders() }
  );
}
