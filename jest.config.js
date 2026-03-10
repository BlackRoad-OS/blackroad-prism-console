module.exports = {
  testEnvironment: 'node',
  verbose: true,
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  roots: ['<rootDir>/tests'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)', '**/?(*.)+(spec|test).mjs'],
  transform: {
    '^.+\\.tsx?$': '<rootDir>/jest.transformer.cjs',
    '^.+sites/.+\\.js$': '<rootDir>/jest.esm-to-cjs.cjs',
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
    '\\.*/sites/blackroad/src/lib/quantumVisualization\\.js$':
      '<rootDir>/tests/shims/quantumVisualization.cjs',
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
