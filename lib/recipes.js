import { BLOCK } from './blockTypes';

export const RECIPES = [
  {
    id: 'wood_to_planks',
    name: '4 Planks',
    description: 'Craft 4 planks from 1 wood block.',
    requires: { [BLOCK.WOOD]: 1 },
    yields: { [BLOCK.PLANKS]: 4 },
  },
  {
    id: 'planks_to_table',
    name: 'Crafting Table',
    description: 'Craft 1 crafting table from 4 planks.',
    requires: { [BLOCK.PLANKS]: 4 },
    yields: { [BLOCK.CRAFTING_TABLE]: 1 },
  },
  {
    id: 'stone_bundle',
    name: 'Stone Bundle',
    description: 'Compress 2 dirt into 1 stone for easy building.',
    requires: { [BLOCK.DIRT]: 2 },
    yields: { [BLOCK.STONE]: 1 },
  },
];

export function canCraft(recipe, inventory) {
  return Object.entries(recipe.requires).every(([blockId, amount]) => (inventory[blockId] ?? 0) >= amount);
}

export function applyRecipe(recipe, inventory) {
  const next = { ...inventory };

  Object.entries(recipe.requires).forEach(([blockId, amount]) => {
    next[blockId] = (next[blockId] ?? 0) - amount;
  });

  Object.entries(recipe.yields).forEach(([blockId, amount]) => {
    next[blockId] = (next[blockId] ?? 0) + amount;
  });

  return next;
}
