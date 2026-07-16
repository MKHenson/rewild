/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

module.exports = {
  clearMocks: false,
  coverageProvider: 'v8',
  setupFiles: ['./jest.setup.js'],
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/src/**/*+(spec|test).[jt]s?(x)'],
  // Mirrors the baseUrl resolution in src/tsconfig.json, which lets modules
  // import each other as 'src/...'.
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
      transform: {
        '^.+\\.[jt]sx?$': '<rootDir>/jest.transform.cjs',
      },
};
