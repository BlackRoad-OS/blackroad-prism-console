module.exports = {
  testEnvironment: 'node',
  verbose: true,
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)', '**/?(*.)+(spec|test).mjs'],
  transform: {
    '^.+\\.tsx?$': '<rootDir>/jest.transformer.cjs',
  },
  moduleNameMapper: {
    '^@blackroad/diffusion-engine$':
      '<rootDir>/packages/diffusion-engine/src/index.ts',
    '^@blackroad/diffusion-engine/(.*)$':
      '<rootDir>/packages/diffusion-engine/src/$1',
    '^@blackroad/diffusion-gateway$':
      '<rootDir>/packages/diffusion-gateway/src/index.ts',
    '^@blackroad/diffusion-gateway/(.*)$':
      '<rootDir>/packages/diffusion-gateway/src/$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'reports',
        outputName: 'junit.xml',
      },
    ],
  ],
  forceExit: true,
};
