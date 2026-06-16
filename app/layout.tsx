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
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
};

const themeBootstrapScript = `(function(){try{var t=localStorage.getItem("imagine_theme_mode");if(t!=="dark"&&t!=="light"){t="dark";}document.documentElement.setAttribute("data-imagine-theme",t);document.documentElement.style.colorScheme=t;}catch(e){}})();`;
const localeBootstrapScript = `(function(){try{var l=localStorage.getItem("imagine_language");if(l==="en"||l==="zh"){document.documentElement.lang=l;}else{var n=(navigator.language||"zh").slice(0,2);document.documentElement.lang=n==="en"?"en":"zh";}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
        <script dangerouslySetInnerHTML={{ __html: localeBootstrapScript }} />
      </head>
      <body suppressHydrationWarning className="imagine-root-body font-sans antialiased">
        <WorkbenchProviders>{children}</WorkbenchProviders>
      </body>
    </html>
  );
}

