'use strict';

// Transform ES module .js files to CommonJS for Jest compatibility.
const ts = require('typescript');

module.exports = {
  process(sourceText, sourcePath) {
    const result = ts.transpileModule(sourceText, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        allowJs: true,
        sourceMap: true,
      },
      fileName: sourcePath,
    });
    return { code: result.outputText, map: result.sourceMapText ?? undefined };
  },
};
