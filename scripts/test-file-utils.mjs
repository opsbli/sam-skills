// Shared helpers for the gates that scan a checkout for test files. The coupling
// gate and the slice gate need the same definition of "a test file" and the same
// walk order; they used to carry byte-identical copies, which drift the moment
// someone changes one and not the other.
//
// Zero dependencies: node builtins only.

import { existsSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";

export const TEST_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx"]);
export const SKIP_DIRS = new Set(["node_modules", ".git", ".workbuddy", "dist", "build"]);

export function isTestFile(path) {
  const base = path.split(/[\\/]/).pop() ?? "";
  const inNamedDir = /(^|[\\/])(tests?|__tests__)[\\/]/.test(path);
  return TEST_EXTENSIONS.has(extname(base)) && (inNamedDir || /\.test\.|\.spec\./.test(base));
}

export function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (isTestFile(full)) out.push(full);
  }
}

export function collectTestFiles(paths) {
  const files = [];
  for (const p of paths) {
    if (!existsSync(p)) continue;
    if (statSync(p).isDirectory()) walk(p, files);
    else if (isTestFile(p)) files.push(p);
  }
  return [...new Set(files)];
}
