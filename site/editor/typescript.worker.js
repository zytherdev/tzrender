import ts from 'typescript';

function formatDiagnostic(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  let line = 1;
  let column = 1;
  if (diagnostic.file && Number.isFinite(diagnostic.start)) {
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    line = position.line + 1;
    column = position.character + 1;
  }
  return { message, line, column, category: diagnostic.category };
}

self.addEventListener('message', (event) => {
  const { id, source } = event.data || {};
  if (!Number.isInteger(id) || typeof source !== 'string' || source.length > 100_000) {
    self.postMessage({ id, error: 'TypeScript files are limited to 100,000 characters.' });
    return;
  }
  if (/^\s*(?:import|export)\s/m.test(source)) {
    self.postMessage({ id, error: 'This browser workspace compiles one TypeScript file at a time; imports and exports need a project bundler, which is not available here.' });
    return;
  }

  try {
    const result = ts.transpileModule(source, {
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.None,
        jsx: ts.JsxEmit.Preserve,
        strict: true,
        noEmitOnError: true,
        removeComments: false,
        sourceMap: false
      }
    });
    const diagnostics = (result.diagnostics || []).map(formatDiagnostic);
    const hasErrors = (result.diagnostics || []).some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    self.postMessage({ id, code: hasErrors ? '' : result.outputText, diagnostics });
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'TypeScript could not be compiled.' });
  }
});
