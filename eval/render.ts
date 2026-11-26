import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  EvaluationResult,
  renderRunReport,
} from '../src/catalog/application/eval/report';

// Re-renders the Markdown report of stored results without calling the model again.
const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error(
    'Uso: npm run eval:render -- eval/results/<archivo>.json [...]',
  );
  process.exit(1);
}

for (const path of paths) {
  const result = JSON.parse(readFileSync(path, 'utf8')) as EvaluationResult;
  const output = join(
    __dirname,
    'reports',
    basename(path).replace(/\.json$/, '.md'),
  );
  writeFileSync(output, renderRunReport(result));
  console.log(`Reporte regenerado: ${output}`);
}
