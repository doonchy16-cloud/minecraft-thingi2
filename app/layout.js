export const metadata = {
  title: 'MiniCraft 3D',
  description: 'A small Minecraft-style browser game built with Next.js and React Three Fiber.',
};

import './globals.css';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
