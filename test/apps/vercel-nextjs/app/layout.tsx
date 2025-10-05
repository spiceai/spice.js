import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Spice.js Vercel Test',
  description: 'Test application for Spice.js browser functionality',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
