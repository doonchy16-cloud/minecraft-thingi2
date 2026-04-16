export const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  WOOD: 4,
  LEAVES: 5,
  PLANKS: 6,
  CRAFTING_TABLE: 7,
};

export const BLOCK_DEFS = {
  [BLOCK.GRASS]: { id: BLOCK.GRASS, name: 'Grass', itemName: 'Grass', solid: true, selectable: true, stackable: true },
  [BLOCK.DIRT]: { id: BLOCK.DIRT, name: 'Dirt', itemName: 'Dirt', solid: true, selectable: true, stackable: true },
  [BLOCK.STONE]: { id: BLOCK.STONE, name: 'Stone', itemName: 'Stone', solid: true, selectable: true, stackable: true },
  [BLOCK.WOOD]: { id: BLOCK.WOOD, name: 'Wood', itemName: 'Wood', solid: true, selectable: true, stackable: true },
  [BLOCK.LEAVES]: { id: BLOCK.LEAVES, name: 'Leaves', itemName: 'Leaves', solid: true, selectable: false, stackable: true },
  [BLOCK.PLANKS]: { id: BLOCK.PLANKS, name: 'Planks', itemName: 'Planks', solid: true, selectable: true, stackable: true },
  [BLOCK.CRAFTING_TABLE]: { id: BLOCK.CRAFTING_TABLE, name: 'Crafting Table', itemName: 'Crafting Table', solid: true, selectable: true, stackable: true },
};

export const HOTBAR_ORDER = [
  BLOCK.GRASS,
  BLOCK.DIRT,
  BLOCK.STONE,
  BLOCK.WOOD,
  BLOCK.PLANKS,
  BLOCK.CRAFTING_TABLE,
];

export const INITIAL_INVENTORY = {
  [BLOCK.GRASS]: 32,
  [BLOCK.DIRT]: 24,
  [BLOCK.STONE]: 18,
  [BLOCK.WOOD]: 8,
  [BLOCK.LEAVES]: 0,
  [BLOCK.PLANKS]: 0,
  [BLOCK.CRAFTING_TABLE]: 0,
};

export function getDropForBlock(blockId) {
  switch (blockId) {
    case BLOCK.GRASS:
      return BLOCK.DIRT;
    case BLOCK.LEAVES:
      return Math.random() < 0.25 ? BLOCK.LEAVES : BLOCK.AIR;
    default:
      return blockId;
  }
}

export function createBlockTexturePatterns() {
  return {
    [BLOCK.GRASS]: {
      top: ['#65b84d', '#77c85b', '#50983d', '#8ddb66'],
      side: ['#7c5835', '#8d643d', '#66b84d', '#5aa143'],
      bottom: ['#7c5835', '#8d643d', '#6f4e2f', '#936a43'],
    },
    [BLOCK.DIRT]: {
      all: ['#7a5734', '#8a643d', '#6a4b2c', '#936b44'],
    },
    [BLOCK.STONE]: {
      all: ['#7f7f83', '#95959b', '#67676a', '#a6a6ad'],
    },
    [BLOCK.WOOD]: {
      side: ['#8a5b2c', '#9d6937', '#71471f', '#b47a45'],
      top: ['#c69456', '#e0ad68', '#9a703f', '#f0c37a'],
      bottom: ['#c69456', '#e0ad68', '#9a703f', '#f0c37a'],
    },
    [BLOCK.LEAVES]: {
      all: ['#2f7d32', '#459e49', '#216325', '#58b35c'],
      transparent: true,
    },
    [BLOCK.PLANKS]: {
      all: ['#b98345', '#d49a59', '#9b6a31', '#e4b16f'],
    },
    [BLOCK.CRAFTING_TABLE]: {
      top: ['#916036', '#b07845', '#6f4827', '#d0985c'],
      side: ['#744824', '#93592d', '#5a3517', '#a7693a'],
      front: ['#744824', '#93592d', '#5a3517', '#d3a06c'],
    },
  };
}

export function blockLabel(blockId) {
  return BLOCK_DEFS[blockId]?.name ?? 'Unknown';
}
