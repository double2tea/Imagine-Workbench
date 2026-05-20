import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css'; // Global styles

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Imagine Workbench — 灵感创作工作台',
  description: 'A professional and elegant AI-powered Image and Video Generation studio workspace featuring advanced prompt optimization, precise canvas masking, batch operation downloading, and an interactive chat-driven Agent Mode.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning className="font-sans antialiased text-slate-100 bg-slate-950">
        {children}
      </body>
    </html>
  );
}

