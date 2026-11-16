import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Poppins } from 'next/font/google';
import { UIProvider } from '@/components/ui';
import './globals.css';

const poppins = Poppins({
  subsets: ['latin', 'latin-ext'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: { default: 'Aguiar&Co · Aprova', template: '%s · Aguiar&Co · Aprova' },
  description: 'Plataforma de aprovação de conteúdo da Aguiar&Co.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#F7F6F4', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>
        <UIProvider>{children}</UIProvider>
      </body>
    </html>
  );
}
