export const clamp = (value: number, max: number): number => (value > max ? max : value);

export const isEmpty = (items: unknown[]): boolean => items.length === 0;
