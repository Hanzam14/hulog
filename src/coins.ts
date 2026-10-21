export const COIN = 28;
export const COIN_GAP = 4;

/** Fewest rows that fit, then spread evenly (15 coins in a 9-wide row: 8 + 7). */
export function coinColumns(total: number, width: number): number {
  const perRow = Math.max(
    1,
    Math.floor((width + COIN_GAP) / (COIN + COIN_GAP)),
  );
  if (total <= perRow) return Math.max(1, total);
  return Math.ceil(total / Math.ceil(total / perRow));
}
