/**
 * The package version, sent in the `User-Agent` header on every request.
 *
 * Kept as a literal rather than imported from package.json so the built bundle
 * stays free of a JSON import. `test/version.test.ts` asserts it stays in sync.
 */
export const VERSION = '0.1.0';
