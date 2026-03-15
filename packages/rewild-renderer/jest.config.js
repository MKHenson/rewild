module.exports = {
  clearMocks: true,
  coverageProvider: 'v8',
  setupFiles: ['./jest.setup.js'],
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/lib/**/*+(spec|test).[jt]s?(x)'],
  transform: {
    '^.+\\.[jt]sx?$': '<rootDir>/../../jest.transform.cjs',
  },
  moduleNameMapper: {
    '\\.wgsl$': '<rootDir>/lib/__mocks__/wgslMock.js',
  },
};
