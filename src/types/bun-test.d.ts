declare module 'bun:test' {
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(value: unknown): {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toContain(expected: unknown): void;
    toThrow(expected?: string | RegExp | Error): void;
    toHaveBeenCalled(): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toBeTruthy(): void;
      toBeFalsy(): void;
      toBeNull(): void;
      toContain(expected: unknown): void;
    };
  };
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
}