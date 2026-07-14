import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('project setup smoke test', () => {
  it('has the expected package name', () => {
    expect(pkg.name).toBe('gabby-is-22');
  });
});
