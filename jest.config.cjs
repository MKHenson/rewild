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
      transform: {
        '^.+\\.[jt]sx?$': '<rootDir>/jest.transform.cjs',
      },
};
