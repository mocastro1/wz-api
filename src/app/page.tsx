export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui' }}>
      <h1>⚡ WZ API</h1>
      <p>BFF (Backend for Frontend) — WhatsApp → Salesforce</p>
      <p style={{ marginTop: '0.5rem' }}>
        📄 <a href="/docs" style={{ color: '#0D9488', fontWeight: 600 }}>Documentação Swagger (OpenAPI)</a>
      </p>
      <h2>Endpoints disponíveis</h2>
      <ul>
        <li><code>GET  /api/health</code> — Health check</li>
        <li><code>POST /api/leads</code> — Criar Lead</li>
        <li><code>POST /api/leads/lookup</code> — Buscar Lead por telefone</li>
        <li><code>GET  /api/leads/:id</code> — Buscar Lead por ID</li>
        <li><code>PATCH /api/leads/:id</code> — Atualizar Lead</li>
        <li><code>POST /api/contacts</code> — Criar Contato</li>
        <li><code>POST /api/activities</code> — Criar Atividade/Task</li>
        <li><code>POST /api/conversations</code> — Registrar conversa</li>
        <li><code>GET  /api/leads/picklist</code> — Picklist values do Lead</li>
        <li><code>GET  /api/auth/check</code> — Verificar autenticação SF</li>
        <li><code>POST /api/auth/[...nextauth]</code> — NextAuth Salesforce OAuth</li>
      </ul>
    </main>
  );
}
