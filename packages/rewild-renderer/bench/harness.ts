import { arch, cpus, platform } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Milliseconds for each stage of one run. */
export type Sample = Record<string, number>;

export interface BenchOptions {
  warmup: number;
  runs: number;
  /** Run only the cases whose name contains this text. */
  filter?: string;
}

export interface StageStats {
  median: number;
  p95: number;
  min: number;
}

export interface CaseResult {
  name: string;
  runs: number;
  stages: Record<string, StageStats>;
}

/** The file `--json` writes and `--compare` reads. */
export interface BenchReport {
  createdAt: string;
  env: {
    node: string;
    platform: string;
    arch: string;
    cpu: string;
    cores: number;
  };
  options: BenchOptions;
  results: CaseResult[];
}

/** Present when node runs with `--expose-gc`. The runner passes it. */
const collectGarbage = (globalThis as { gc?: () => void }).gc;

/** Nearest-rank percentile of sorted values. */
const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

/**
 * Times one case.
 *
 * `run` receives the run index, so a case can cycle through fixed inputs. It
 * returns the cost of each stage. Garbage is collected before each run, so one
 * run does not pay for the garbage of the run before it.
 */
export function runCase(
  name: string,
  options: BenchOptions,
  run: (index: number) => Sample
): CaseResult {
  for (let i = 0; i < options.warmup; i++) {
    collectGarbage?.();
    run(i);
  }

  const samples: Sample[] = [];
  for (let i = 0; i < options.runs; i++) {
    collectGarbage?.();
    samples.push(run(i));
  }

  const stages: Record<string, StageStats> = {};
  for (const stage of Object.keys(samples[0])) {
    const values = samples.map((s) => s[stage]).sort((a, b) => a - b);
    stages[stage] = {
      median: percentile(values, 0.5),
      p95: percentile(values, 0.95),
      min: values[0],
    };
  }
  return { name, runs: options.runs, stages };
}

export function createReport(
  options: BenchOptions,
  results: CaseResult[]
): BenchReport {
  return {
    createdAt: new Date().toISOString(),
    env: {
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? 'unknown',
      cores: cpus().length,
    },
    options,
    results,
  };
}

export function writeReport(path: string, report: BenchReport) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
}

export const readReport = (path: string): BenchReport =>
  JSON.parse(readFileSync(path, 'utf8'));

const ms = (value: number) => value.toFixed(2).padStart(9);

/**
 * Prints one row for each stage of each case.
 *
 * With a baseline, the last column is the baseline median divided by this
 * median. A value above 1 means this run is faster.
 */
export function printReport(report: BenchReport, baseline?: BenchReport) {
  const { env } = report;
  console.log(
    `node ${env.node} · ${env.platform}/${env.arch} · ${env.cpu} ` +
      `(${env.cores} cores) · ${report.options.runs} runs after ` +
      `${report.options.warmup} warm-up`
  );
  if (baseline) {
    console.log(
      `baseline: ${baseline.createdAt} · ${baseline.env.platform}/` +
        `${baseline.env.arch} · ${baseline.env.cpu}`
    );
  }

  const header =
    'case'.padEnd(28) +
    'stage'.padEnd(10) +
    'median'.padStart(9) +
    'p95'.padStart(9) +
    'min'.padStart(9) +
    (baseline ? '  vs base' : '');
  console.log('');
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const result of report.results) {
    const base = baseline?.results.find((r) => r.name === result.name);
    for (const [stage, stats] of Object.entries(result.stages)) {
      const baseStats = base?.stages[stage];
      const speedup = baseStats
        ? `${(baseStats.median / stats.median).toFixed(2)}x`.padStart(9)
        : baseline
        ? '        -'
        : '';
      console.log(
        result.name.padEnd(28) +
          stage.padEnd(10) +
          ms(stats.median) +
          ms(stats.p95) +
          ms(stats.min) +
          speedup
      );
    }
  }
  console.log('');
  console.log('all values are milliseconds per run.');
}
