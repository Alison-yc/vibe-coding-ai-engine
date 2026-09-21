const MAX_MODEL_OUTPUT_BYTES = 50 * 1024;

export const truncateToolOutput = (value: string): string => {
  const bytes = Buffer.from(value);
  if (bytes.byteLength <= MAX_MODEL_OUTPUT_BYTES) return value;
  return `${bytes.subarray(0, MAX_MODEL_OUTPUT_BYTES).toString('utf8')}\n\n[内容已截断，超过 50KB]`;
};

export const truncateDiff = (value: string): string =>
  value.length <= 90_000 ? value : `${value.slice(0, 90_000)}\n[diff 已截断]`;
