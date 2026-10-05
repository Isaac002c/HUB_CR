import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'CR Recursos | Sistema de Gestão',
  description: 'Sistema próprio de gestão da CR Recursos',
  icons: {
    icon: '/logos/cr-recursos.png',
    shortcut: '/logos/cr-recursos.png',
    apple: '/logos/cr-recursos.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
