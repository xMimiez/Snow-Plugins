# Tests

`npm test` runs `native.test.cjs`, the current Snow API v1 suite. All network operations in this suite are mocks; no real messages, gifts, uploads or server updates occur.

The other `.test.cjs` files and `helpers.cjs` are retained as historical tests for the frozen Bunny 1.x `index.ts` artifacts. They are not the current native release checks.
