export default {
  sourceDir: '.',
  artifactsDir: 'web-ext-artifacts',
  ignoreFiles: [
    'tests', 'tests/**', 'docs', 'docs/**', 'node_modules/**', '.git/**', '.superpowers/**',
    'package.json', 'package-lock.json', 'README.md', 'web-ext-config.mjs',
    '.gitignore', 'web-ext-artifacts/**',
  ],
  build: { overwriteDest: true },
};
