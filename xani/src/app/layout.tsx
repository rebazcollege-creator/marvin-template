import type { Metadata } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import './globals.css';
import { Watcher } from '@/components/system/Watcher';

// Quiet Stone identity: Fraunces is the display serif (kept under the
// --font-playfair variable name so globals.css / tailwind need no change).
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Xanî',
  description: 'A personal AI operating system. MARVIN at the centre.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${fraunces.variable} ${inter.variable}`}>
      <body className="bg-bg text-text">
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('xani.theme');if(t){document.documentElement.dataset.xtheme=t;}}catch(e){}})();",
          }}
        />
        <Watcher />
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
