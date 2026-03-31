import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'WZ API',
  description: 'BFF (Backend for Frontend) — WhatsApp → Salesforce',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
