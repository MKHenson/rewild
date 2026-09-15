module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  // The repo's esbuild transform, which already strips types. Node runs these
  // files without it; jest needs one because it loads modules itself.
  transform: { '^.+\\.ts$': '<rootDir>/../../jest.transform.cjs' },
  // The sources import each other with the extension node needs, which jest's
  // resolver would otherwise take literally and fail to find.
  moduleNameMapper: { '^(\\.{1,2}/.*)\\.ts$': '$1' },
  testMatch: ['<rootDir>/**/*.spec.ts'],
};
