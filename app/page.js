'use client';

import dynamic from 'next/dynamic';

const MinecraftGame = dynamic(() => import('../components/MinecraftGame'), {
  ssr: false,
  loading: () => (
    <main
      style={{
        width: '100vw',
        height: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#0f1117',
        color: '#f7f7f7',
        fontFamily: 'Inter, Arial, sans-serif',
      }}
    >
      <div>Loading MiniCraft 3D…</div>
    </main>
  ),
});

export default function Page() {
  return <MinecraftGame />;
}
