# MiniCraft 3D

A Vercel-ready browser game inspired by Minecraft. This is a compact prototype focused on a playable first slice rather than a full clone.

## Included features

- First-person 3D movement with mouse look and pointer lock
- Procedural voxel terrain with trees and an infinite-ish feel around the player
- Mining and placing blocks
- Hotbar and inventory counts
- Simple crafting recipes
- Day / night cycle
- Basic hostile mobs at night
- Pixel-style textures generated in code

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown in your terminal.

## Deploy to Vercel

1. Upload the project folder to a GitHub repo or import the folder directly.
2. In Vercel, create a new project from that repo.
3. Framework preset should detect **Next.js** automatically.
4. Deploy.

## Controls

- **WASD**: Move
- **Space**: Jump
- **Mouse**: Look around
- **Left click**: Break block / hit mob
- **Right click**: Place block
- **Mouse wheel** or **1-6**: Switch hotbar slots
- **C**: Toggle crafting panel
- **Esc**: Unlock cursor

## Notes

- This is intentionally a lightweight prototype, not a full Minecraft recreation.
- Terrain is generated procedurally each frame window around the player, while edits are stored so player changes persist during the session.
- Textures are generated programmatically so the project is self-contained.
