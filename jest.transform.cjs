const esbuild = require('esbuild');

module.exports = {
  process(sourceText, sourcePath) {
    const loader = sourcePath.endsWith('.ts') ? 'ts'
      : sourcePath.endsWith('.tsx') ? 'tsx'
      : sourcePath.endsWith('.jsx') ? 'jsx'
      : 'js';

    const result = esbuild.transformSync(sourceText, {
      loader,
      format: 'cjs',
      target: 'node20',
    });

    return { code: result.code };
  },
};
