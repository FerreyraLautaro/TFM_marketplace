import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  EvaluationResult,
  renderComparison,
} from '../src/catalog/application/eval/report';

const [baselinePath, candidatePath] = process.argv.slice(2);
if (!baselinePath || !candidatePath) {
  console.error(
    'Uso: npm run eval:compare -- eval/results/<v1>.json eval/results/<v2>.json',
  );
  process.exit(1);
}

const load = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as EvaluationResult;
const baseline = load(baselinePath);
const candidate = load(candidatePath);

mkdirSync(join(__dirname, 'reports'), { recursive: true });
const output = join(
  __dirname,
  'reports',
  `comparacion-${baseline.promptVersion}-vs-${candidate.promptVersion}.md`,
);
writeFileSync(output, renderComparison(baseline, candidate));
console.log(
  `Comparación de ${basename(baselinePath)} y ${basename(candidatePath)}: ${output}`,
);
