// Política de Privacidade da extensão WZ Conecta.
// Servida como HTML público em https://wzapi.viacometa.com.br/api/privacy
// (usada no campo "URL da Política de Privacidade" da Chrome Web Store).
// Fica sob /api/ porque o reverse proxy (nginx) só encaminha esse prefixo ao app.
// Rota pública: não chama o guard de autenticação.

const HTML = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Política de Privacidade — WZ Conecta · Grupo Cometa</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
         line-height: 1.6; max-width: 860px; margin: 0 auto; padding: 40px 20px;
         color: #1a1a1a; background: #fff; }
  @media (prefers-color-scheme: dark) { body { color: #e6e6e6; background: #121212; }
    a { color: #7ab7ff; } th { background: #ffffff14 !important; } td, th { border-color: #ffffff26 !important; } }
  h1 { font-size: 1.7rem; margin-bottom: .2rem; }
  h2 { font-size: 1.2rem; margin-top: 2rem; border-bottom: 1px solid #8883; padding-bottom: .3rem; }
  h3 { font-size: 1.02rem; margin-top: 1.4rem; }
  .meta { color: #888; font-size: .9rem; margin-bottom: 1.5rem; }
  ul, ol { padding-left: 1.3rem; }
  code { background: #8882; padding: 1px 5px; border-radius: 4px; font-size: .9em; }
  table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: .95rem; }
  th, td { border: 1px solid #0002; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #00000008; }
  .disclaimer { font-size: .9rem; color: #888; }
</style>
</head>
<body>

<h1>Política de Privacidade — WZ Conecta</h1>
<p class="meta">
  <strong>Extensão:</strong> WZ Conecta — Grupo Cometa (Extensão do Chrome)<br>
  <strong>Responsável:</strong> Grupo Cometa — Inovação<br>
  <strong>Última atualização:</strong> 14 de julho de 2026
</p>

<p>
  Esta extensão é uma ferramenta de <strong>uso corporativo autorizado</strong>, destinada a
  vendedores do Grupo Cometa para integrar o WhatsApp Web ao CRM Salesforce da própria
  organização. Não é um produto de consumo geral e não comercializa, vende ou compartilha
  dados com terceiros para fins de publicidade ou análise.
</p>
<p class="disclaimer">
  Esta extensão <strong>não é afiliada, endossada ou patrocinada</strong> pelo WhatsApp/Meta
  nem pela Salesforce. "WhatsApp" e "Salesforce" são marcas de seus respectivos titulares,
  citadas aqui apenas de forma descritiva, para indicar compatibilidade.
</p>

<h2>1. Quais dados são acessados</h2>
<p>A extensão funciona <strong>exclusivamente</strong> em <code>https://web.whatsapp.com/</code> e acessa, durante o uso:</p>
<table>
  <tr><th>Dado</th><th>Origem</th><th>Finalidade</th></tr>
  <tr><td>Telefone do contato</td><td>Conversa aberta no WhatsApp Web</td><td>Localizar/criar Lead ou Oportunidade no Salesforce</td></tr>
  <tr><td>Nome do contato</td><td>Conversa aberta no WhatsApp Web</td><td>Preencher o Lead e exibir no painel</td></tr>
  <tr><td>Texto das mensagens recentes</td><td>Conversa aberta (apenas quando o vendedor clica em "Registrar Contato")</td><td>Registrar o histórico da conversa como atividade no Salesforce</td></tr>
  <tr><td>Telefone do vendedor logado</td><td>Sessão do WhatsApp Web</td><td>Atribuir o registro ao vendedor responsável</td></tr>
  <tr><td>Identidade Salesforce (nome, ID, concessionária)</td><td>API do Salesforce, após login</td><td>Vincular os registros criados ao usuário correto</td></tr>
</table>
<p>
  A extensão <strong>não</strong> lê conversas de terceiros automaticamente, <strong>não</strong>
  envia mensagens, <strong>não</strong> automatiza ações no WhatsApp e <strong>não</strong>
  acessa contatos fora da conversa aberta pelo próprio vendedor.
</p>

<h2>2. Onde os dados ficam armazenados</h2>
<h3>Localmente, no seu navegador (<code>chrome.storage.local</code>)</h3>
<p>Os seguintes dados ficam <strong>apenas no seu dispositivo</strong> e nunca são persistidos em servidor:</p>
<ul>
  <li><code>wzsf_auth</code> — token de acesso e <em>refresh token</em> do Salesforce, URL da instância, nome e ID do usuário</li>
  <li><code>wzsf_user_data</code> — ID do usuário e referência da concessionária</li>
  <li><code>wzsf_seller_phone</code> — telefone do vendedor logado no WhatsApp</li>
  <li><code>wzsf_sent_cache</code> — cache de 24h que evita registros duplicados</li>
  <li><code>wzsf_logged_out</code> — sinalizador de logout entre abas</li>
</ul>
<p>
  Os tokens do Salesforce <strong>não são persistidos em nenhum servidor</strong>. Eles são
  enviados — sob HTTPS — como cabeçalho de autorização (<code>X-SF-Access-Token</code>) ao
  wz-api, que os utiliza para executar, em seu nome, as operações no Salesforce. O wz-api não
  armazena o token de forma persistente (ver item 3).
</p>
<h3>No CRM Salesforce</h3>
<p>
  Os Leads, Oportunidades, atividades e registros de conversa criados pela extensão são
  gravados no <strong>Salesforce da própria organização</strong> (Grupo Cometa), sujeitos às
  políticas de retenção e segurança do CRM corporativo.
</p>

<h2>3. Para onde os dados são enviados</h2>
<p>A extensão se comunica com dois destinos, ambos via <strong>HTTPS</strong>:</p>
<ol>
  <li><strong>wz-api</strong> (<code>https://wzapi.viacometa.com.br</code>) — serviço
    intermediário (BFF) do próprio Grupo Cometa. Recebe os dados da extensão, valida e os
    encaminha ao Salesforce. Não armazena dados de negócio de forma persistente (os logs
    operacionais são mantidos em memória, de forma temporária, com dados sensíveis mascarados).</li>
  <li><strong>Salesforce</strong> (<code>https://*.salesforce.com</code>,
    <code>https://*.force.com</code>) — login OAuth 2.0 e destino final dos registros.</li>
</ol>
<p><strong>Não há</strong> envio de dados para serviços de publicidade, redes de rastreamento ou qualquer terceiro não listado acima.</p>
<h3>Telemetria técnica</h3>
<p>
  A extensão envia ao wz-api eventos de <strong>diagnóstico técnico</strong> (ex.: falha ao
  localizar um elemento da página) para detectar quando o WhatsApp Web muda de estrutura. Cada
  evento inclui: a versão da extensão, o <strong>User-Agent do navegador</strong> (identifica
  navegador, versão e sistema operacional), a <strong>URL da página</strong> no momento da falha
  (sempre dentro de <code>web.whatsapp.com</code>) e, eventualmente, o identificador do contato
  em processamento. Esses dados são usados <strong>exclusivamente</strong> para manutenção da
  ferramenta — nunca para perfilamento, rastreamento publicitário ou marketing.
</p>

<h2>4. Autenticação</h2>
<p>
  O acesso ao Salesforce usa <strong>OAuth 2.0 com PKCE</strong> (fluxo de cliente público, sem
  segredo embutido). Você se autentica diretamente no Salesforce; a extensão recebe um token de
  acesso de escopo limitado. Nenhuma senha do Salesforce é vista, armazenada ou transmitida pela extensão.
</p>

<h2>5. Permissões e por que são necessárias</h2>
<table>
  <tr><th>Permissão</th><th>Motivo</th></tr>
  <tr><td><code>storage</code></td><td>Guardar token e cache localmente no navegador</td></tr>
  <tr><td><code>identity</code></td><td>Gerar a URL de redirecionamento do login OAuth</td></tr>
  <tr><td><code>tabs</code></td><td>Abrir o fluxo de login e focar a aba do WhatsApp Web</td></tr>
  <tr><td><code>host_permissions</code></td><td>web.whatsapp.com, wzapi.viacometa.com.br, *.salesforce.com, *.force.com — ler a conversa, falar com o BFF e autenticar no CRM</td></tr>
</table>

<h2>6. Retenção e exclusão</h2>
<ul>
  <li><strong>Dados locais:</strong> removidos ao fazer <strong>logout</strong> na extensão ou ao <strong>desinstalá-la</strong>.</li>
  <li><strong>Dados no Salesforce:</strong> regidos pela política de retenção do CRM corporativo do Grupo Cometa.</li>
  <li><strong>Logs do wz-api:</strong> temporários, mantidos em memória (buffer limitado) e com dados sensíveis mascarados; perdidos a cada reinício do serviço.</li>
</ul>
<p>Para solicitar a exclusão de dados gravados no Salesforce, contate o administrador do CRM do Grupo Cometa.</p>

<h2>7. Conformidade</h2>
<ul>
  <li>A extensão destina-se a <strong>uso interno autorizado</strong>. O uso pressupõe consentimento da conta WhatsApp do vendedor e conformidade com as políticas internas do Grupo Cometa.</li>
  <li>Não coletamos dados de menores nem categorias especiais de dados de forma intencional.</li>
  <li>Não vendemos nem compartilhamos dados pessoais com terceiros.</li>
</ul>

<h2>8. Contato</h2>
<p>
  Dúvidas sobre esta política ou sobre tratamento de dados:<br>
  <strong>Grupo Cometa — Inovação</strong> ·
  <a href="mailto:maycon.castro@viacometa.com.br">maycon.castro@viacometa.com.br</a>
</p>

<p class="disclaimer">
  Esta política pode ser atualizada conforme a extensão evolui. A data no topo indica a última revisão.
</p>

</body>
</html>`;

export const dynamic = 'force-static';

export async function GET() {
  return new Response(HTML, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
