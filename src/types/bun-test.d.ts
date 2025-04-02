// Type definitions for bun:test
declare module 'bun:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  
  interface ExpectResult {
    toBe(expected: unknown): void;
    toBeNull(): void;
    toContain(expected: unknown): void;
    not: {
      toBeNull(): void;
      toBe(expected: unknown): void;
      toContain(expected: unknown): void;
    };
  }
  
  export const expect: {
    (value: unknown): ExpectResult;
  };
  
  export const mock: {
    module(moduleName: string, factory: () => Record<string, unknown>): void;
  };
}