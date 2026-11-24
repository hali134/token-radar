// Token Radar, the entrypoint (Node 22, standard library only).
//
// It turns the sealed snapshot into the ranked board and the static dashboard the judge reads:
// read /input/snapshot.json (or --input <file|dir>), score every pre-token protocol with the
// model in lib/model.ts, write the board to /output/board.json, write the dashboard's data beside
// it as data.js, copy this repository's dashboard/ and screenshots/ into /output, and finish by
// writing /output/dossier.json with the vendored make.fun library, which rebuilds the dossier
// from the same /output and compares bytes. The dashboard is a static page, no framework and no
// network: dashboard/index.html, dashboard/app.css and dashboard/app.js read the data.js this
// program writes from the same board, so the page and the board can never disagree.
//
// The board covers the whole watchlist plus every other protocol the watchlist's own rule would
// keep, states the model and its confidence signal, and gives every protocol a farm plan priced
// by the chain it runs on. A starting point is not a winner: this entry's model, page and plan
// are its own work on top of the kit's shape.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const DOSSIER_TEXT_MAX_BYTES = 65_536;
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const DASH_LIMIT = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** A fatal problem: printed, then the process leaves with `code`. */
function fail(message: string, code: number): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

/** The command line's flags as a map: `--name value` and `--name=value` both land here. */
function parseFlags(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    if (eq >= 0) {
      flags.set(a.slice(2, eq), a.slice(eq + 1));
    } else if (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
      flags.set(a.slice(2), argv[++i]!);
    } else {
      flags.set(a.slice(2), '');
    }
  }
  return flags;
}

/** The snapshot's path: the --input flag, a file or the directory holding snapshot.json. */
function snapshotPath(flags: Map<string, string>): string {
  const given = flags.get('input') ?? '/input';
  const path = given.endsWith('.json') ? given : join(given, 'snapshot.json');
  if (!existsSync(path)) {
    fail(`no snapshot at ${path}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
  }
  return path;
}

/** The output directory: --output, else MAKEFUN_OUTPUT_DIR, else the grader's /output. */
function outputDir(flags: Map<string, string>): string {
  return flags.get('output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

/**
 * Copy a directory's regular files into `to`, skipping names that start with a dot, and return
 * the names copied, in directory order.
 */
function copyTree(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** The screenshots, refused unless there are at least three of them with plain names. */
function checkShots(names: string[]): void {
  if (names.length < 3) {
    fail(
      `screenshots/ holds ${names.length} image${names.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`,
      1,
    );
  }
  for (const name of names) {
    if (!SHOT_NAME.test(name)) {
      fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`, 1);
    }
  }
}

/** The whole run: read, score, check, write, copy, dossier, and say what happened. */
function main(): void {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const flags = parseFlags(process.argv.slice(2));
  const inputFile = snapshotPath(flags);
  const out = outputDir(flags);

  const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) fail(`the model wrote a board the gate refuses: ${issue}`, 1);

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
  writeFileSync(join(out, 'data.js'), dataScript(radar));

  copyTree(join(root, 'dashboard'), join(out, 'dashboard'));
  const shots = copyTree(join(root, 'screenshots'), join(out, 'screenshots'));
  checkShots(shots);

  // The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
  writeFileSync(
    join(out, 'dossier.json'),
    buildDossier(out, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES, screenshots: SHOT_LIMIT, dashboard: DASH_LIMIT }),
  );

  process.stdout.write(
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
      `${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
      `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ` +
      `${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
  );
}

main();
