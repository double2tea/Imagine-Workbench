import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import WorkbenchProviders from '@/components/workbench/WorkbenchProviders';
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

const themeBootstrapScript = `(function(){try{var t=localStorage.getItem("imagine_theme_mode");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-imagine-theme",t);}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body suppressHydrationWarning className="imagine-root-body font-sans antialiased">
        <WorkbenchProviders>{children}</WorkbenchProviders>
      </body>
    </html>
  );
}

