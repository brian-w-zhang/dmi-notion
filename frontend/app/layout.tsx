import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dunder Mifflin Infinity',
  description: 'Generative agent simulation — Dunder Mifflin Scranton branch',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full overflow-hidden bg-gray-950 antialiased">
        {children}
      </body>
    </html>
  );
}
