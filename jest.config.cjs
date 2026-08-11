/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

module.exports = {
  clearMocks: false,
  coverageProvider: 'v8',
  setupFiles: ['./jest.setup.js'],
  testEnvironment: 'jsdom',
  testMatch: [
    '<rootDir>/src/**/*+(spec|test).[jt]s?(x)',
    '<rootDir>/scripts/**/*+(spec|test).[jt]s?(x)',
  ],
  // Mirrors the baseUrl resolution in src/tsconfig.json, which lets modules
  // import each other as 'src/...'.
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    // Importing anything from the rewild-renderer barrel pulls in Renderer and
    // with it the shader files, which are esbuild-loaded in the app but plain
    // text to jest. Same mock the renderer package's own config uses.
    '\\.wgsl$': '<rootDir>/packages/rewild-renderer/lib/__mocks__/wgslMock.js',
  },
  transform: {
    '^.+\\.[jt]sx?$': '<rootDir>/jest.transform.cjs',
  },
};
