module.exports = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/lib/**/*+(spec|test).[jt]s?(x)'],
  transform: {
    '^.+.[jt]sx?$': '<rootDir>/../../jest.transform.cjs',
  },
};
