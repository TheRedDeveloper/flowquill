export type CountArgs = { count?: number; };

export const parseCount = (args: unknown): number => {
  const value = typeof args === "object" && args !== null ? (args as CountArgs).count : undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 1) {
    return 1;
  }
  return Math.floor(value);
};

