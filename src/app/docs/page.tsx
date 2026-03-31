'use client';

import { useEffect } from 'react';

export default function DocsPage() {
  useEffect(() => {
    // Carregar CSS do Swagger UI
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui.css';
    document.head.appendChild(link);

    // Carregar script do Swagger UI
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js';
    script.onload = () => {
      (window as any).SwaggerUIBundle({
        url: '/api/docs',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          (window as any).SwaggerUIBundle.presets.apis,
          (window as any).SwaggerUIBundle.SwaggerUIStandalonePreset,
        ],
        layout: 'BaseLayout',
        defaultModelsExpandDepth: 2,
        docExpansion: 'list',
        filter: true,
      });
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      if (script.parentNode) document.body.removeChild(script);
    };
  }, []);

  return <div id="swagger-ui" style={{ margin: 0 }} />;
}
