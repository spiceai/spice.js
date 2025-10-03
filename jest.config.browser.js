/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/test/browser/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/browser/setup.ts'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  moduleNameMapper: {
    '^@spiceai/spice$': '<rootDir>/src/index.browser.ts',
  },
};
