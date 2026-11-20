import { ValueTransformer } from 'typeorm';

// Postgres returns numeric as a string to avoid precision loss; two decimals fit safely in a JS number.
export const numericTransformer: ValueTransformer = {
  to: (value: number) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};
