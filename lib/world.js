import { BLOCK } from './blockTypes';

const TREE_CELL_SIZE = 9;

export function keyOf(x, y, z) {
  return `${x},${y},${z}`;
}

export function parseKey(key) {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

function fract(n) {
  return n - Math.floor(n);
}

function hash2(x, z) {
  return fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453123);
}

function smoothNoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const xf = x - x0;
  const zf = z - z0;

  const v00 = hash2(x0, z0);
  const v10 = hash2(x0 + 1, z0);
  const v01 = hash2(x0, z0 + 1);
  const v11 = hash2(x0 + 1, z0 + 1);

  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const x1 = v00 * (1 - u) + v10 * u;
  const x2 = v01 * (1 - u) + v11 * u;
  return x1 * (1 - v) + x2 * v;
}

export function terrainHeight(x, z) {
  const continental = smoothNoise(x * 0.045, z * 0.045) * 10;
  const detail = smoothNoise(x * 0.11 + 100, z * 0.11 - 100) * 5;
  const ridges = Math.abs(smoothNoise(x * 0.022 - 300, z * 0.022 + 300) - 0.5) * 9;
  return Math.max(2, Math.floor(6 + continental + detail - ridges * 0.35));
}

function treeAnchorForCell(cellX, cellZ) {
  const chance = hash2(cellX * 19.3 + 17, cellZ * 23.7 - 9);
  if (chance < 0.84) {
    return null;
  }

  const offsetX = Math.floor(hash2(cellX * 11.1 + 7, cellZ * 13.4 + 3) * (TREE_CELL_SIZE - 2)) + 1;
  const offsetZ = Math.floor(hash2(cellX * 17.2 - 4, cellZ * 5.8 + 9) * (TREE_CELL_SIZE - 2)) + 1;

  const x = cellX * TREE_CELL_SIZE + offsetX;
  const z = cellZ * TREE_CELL_SIZE + offsetZ;
  const groundY = terrainHeight(x, z);
  const trunkHeight = 3 + Math.floor(hash2(cellX * 7.7 + 22, cellZ * 4.4 - 18) * 3);

  if (groundY < 4) {
    return null;
  }

  return { x, z, groundY, trunkHeight };
}

function treeBlockAt(x, y, z) {
  const cellX = Math.floor(x / TREE_CELL_SIZE);
  const cellZ = Math.floor(z / TREE_CELL_SIZE);

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      const anchor = treeAnchorForCell(cellX + dx, cellZ + dz);
      if (!anchor) {
        continue;
      }

      if (x === anchor.x && z === anchor.z && y > anchor.groundY && y <= anchor.groundY + anchor.trunkHeight) {
        return BLOCK.WOOD;
      }

      const leafBase = anchor.groundY + anchor.trunkHeight - 1;
      const leafRadius = 2;
      if (
        y >= leafBase &&
        y <= leafBase + 2 &&
        Math.abs(x - anchor.x) <= leafRadius &&
        Math.abs(z - anchor.z) <= leafRadius &&
        Math.abs(y - (leafBase + 1)) + Math.abs(x - anchor.x) + Math.abs(z - anchor.z) <= 4
      ) {
        if (!(x === anchor.x && z === anchor.z && y <= anchor.groundY + anchor.trunkHeight)) {
          return BLOCK.LEAVES;
        }
      }
    }
  }

  return BLOCK.AIR;
}

export function getBaseBlock(x, y, z) {
  if (y < 0) {
    return BLOCK.STONE;
  }

  const height = terrainHeight(x, z);

  if (y > height) {
    const treeBlock = treeBlockAt(x, y, z);
    return treeBlock;
  }

  if (y === height) {
    return BLOCK.GRASS;
  }

  if (y >= height - 2) {
    return BLOCK.DIRT;
  }

  return BLOCK.STONE;
}

export function getBlock(x, y, z, edits) {
  const key = keyOf(x, y, z);
  if (edits.has(key)) {
    return edits.get(key);
  }
  return getBaseBlock(x, y, z);
}

export function isSolidBlock(blockId) {
  return blockId !== BLOCK.AIR;
}

export function isExposed(x, y, z, edits) {
  if (!isSolidBlock(getBlock(x, y, z, edits))) {
    return false;
  }

  const neighbors = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];

  return neighbors.some(([dx, dy, dz]) => getBlock(x + dx, y + dy, z + dz, edits) === BLOCK.AIR);
}

export function raycastVoxel(origin, direction, maxDistance, edits) {
  const dir = { x: direction.x, y: direction.y, z: direction.z };
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
  dir.x /= len;
  dir.y /= len;
  dir.z /= len;

  let x = Math.floor(origin.x);
  let y = Math.floor(origin.y);
  let z = Math.floor(origin.z);

  const stepX = Math.sign(dir.x) || 0;
  const stepY = Math.sign(dir.y) || 0;
  const stepZ = Math.sign(dir.z) || 0;

  const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Number.POSITIVE_INFINITY;
  const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Number.POSITIVE_INFINITY;
  const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Number.POSITIVE_INFINITY;

  const intBound = (s, ds) => {
    if (ds === 0) {
      return Number.POSITIVE_INFINITY;
    }
    const frac = s - Math.floor(s);
    if (ds > 0) {
      return (1 - frac) / ds;
    }
    return frac / -ds;
  };

  let tMaxX = intBound(origin.x, dir.x);
  let tMaxY = intBound(origin.y, dir.y);
  let tMaxZ = intBound(origin.z, dir.z);
  let faceNormal = null;
  let traveled = 0;

  while (traveled <= maxDistance) {
    const blockId = getBlock(x, y, z, edits);
    if (blockId !== BLOCK.AIR) {
      return {
        block: { x, y, z },
        faceNormal: faceNormal ?? { x: 0, y: 1, z: 0 },
        blockId,
        distance: traveled,
      };
    }

    if (tMaxX < tMaxY && tMaxX < tMaxZ) {
      x += stepX;
      traveled = tMaxX;
      tMaxX += tDeltaX;
      faceNormal = { x: -stepX, y: 0, z: 0 };
    } else if (tMaxY < tMaxZ) {
      y += stepY;
      traveled = tMaxY;
      tMaxY += tDeltaY;
      faceNormal = { x: 0, y: -stepY, z: 0 };
    } else {
      z += stepZ;
      traveled = tMaxZ;
      tMaxZ += tDeltaZ;
      faceNormal = { x: 0, y: 0, z: -stepZ };
    }
  }

  return null;
}

export function playerIntersectsBlock(position, size, x, y, z) {
  const minX = position.x - size.radius;
  const maxX = position.x + size.radius;
  const minY = position.y;
  const maxY = position.y + size.height;
  const minZ = position.z - size.radius;
  const maxZ = position.z + size.radius;

  return !(maxX <= x || minX >= x + 1 || maxY <= y || minY >= y + 1 || maxZ <= z || minZ >= z + 1);
}

export function collidesWorld(position, size, edits) {
  const minX = Math.floor(position.x - size.radius);
  const maxX = Math.floor(position.x + size.radius);
  const minY = Math.floor(position.y);
  const maxY = Math.floor(position.y + size.height);
  const minZ = Math.floor(position.z - size.radius);
  const maxZ = Math.floor(position.z + size.radius);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        if (isSolidBlock(getBlock(x, y, z, edits)) && playerIntersectsBlock(position, size, x, y, z)) {
          return true;
        }
      }
    }
  }

  return false;
}
