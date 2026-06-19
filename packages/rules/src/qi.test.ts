import { describe, it, expect } from 'vitest';
import { ZERO, whole } from './qi';

describe('Qi (milli-qi integers)', () => {
  it('whole + integer arithmetic + comparison', () => {
    expect(whole(2) + whole(3)).toBe(whole(5));
    expect(whole(5) - whole(3)).toBe(whole(2));
    expect(whole(2) < whole(3)).toBe(true);
    expect(ZERO).toBe(whole(0));
  });
});
