#!/usr/bin/env node
// Bundles one Node app (backend/worker) with esbuild for production images.
//
// Inlines @modulocate/* workspace packages — they ship raw TS with no build
// step of their own (main points straight at src/index.ts), so tsx/vite can
// import them directly in dev, but plain `node` can't run .ts at all. Real
// npm dependencies stay external and get resolved from node_modules at
// runtime as usual: bullmq reads its own Lua scripts off disk via __dirname,
// and @react-pdf/renderer's yoga-layout ships a WASM binary — both break if
// pulled into the bundle instead of staying normal on-disk packages.
import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const appName = process.argv[2];

if (!appName) {
  console.error("Usage: node infra/esbuild-build.mjs <app-name>");
  process.exit(1);
}

function readPkg(dir) {
  return JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
}

function findWorkspacePackages() {
  const dirs = [
    ...readdirSync(path.join(rootDir, "apps")).map((name) => path.join(rootDir, "apps", name)),
    ...readdirSync(path.join(rootDir, "packages")).map((name) => path.join(rootDir, "packages", name)),
  ];
  const byName = new Map();
  for (const dir of dirs) {
    const pkg = readPkg(dir);
    byName.set(pkg.name, { dir, pkg });
  }
  return byName;
}

const workspace = findWorkspacePackages();
const appDir = path.join(rootDir, "apps", appName);
const appPkg = readPkg(appDir);

// Union of real npm dependencies pulled in by the app itself plus every
// @modulocate/* workspace package reachable from it (recursively) — that
// full set has to stay external, since bundling a workspace package inlines
// its imports too.
const external = new Set();
const visited = new Set();

function collect(pkg) {
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (dep.startsWith("@modulocate/")) {
      if (visited.has(dep)) continue;
      visited.add(dep);
      const entry = workspace.get(dep);
      if (!entry) throw new Error(`Workspace package ${dep} not found while bundling ${appName}`);
      collect(entry.pkg);
    } else {
      external.add(dep);
    }
  }
}
collect(appPkg);

// Node resolves each external import from the *bundled file's* location
// (apps/<app>/dist/index.js), not from wherever the source that originally
// imported it lived — so a package only pulled in transitively via a
// workspace dependency (e.g. backend bundles @modulocate/db, which imports
// "postgres", but backend itself never did) has to be declared as a direct
// dependency here too, or pnpm never symlinks it into apps/<app>/node_modules
// and the bundle fails at runtime with ERR_MODULE_NOT_FOUND.
const ownDeps = new Set(Object.keys(appPkg.dependencies ?? {}));
const undeclared = [...external].filter((dep) => !ownDeps.has(dep));
if (undeclared.length > 0) {
  console.error(
    `[esbuild] ${appName}: bundled code imports these packages transitively through a ` +
      `workspace dependency, but they're missing from apps/${appName}/package.json ` +
      `"dependencies": ${undeclared.join(", ")}\n` +
      `Add them there (matching the version used by the workspace package that needs them) so pnpm can resolve them at runtime.`,
  );
  process.exit(1);
}

await build({
  entryPoints: [path.join(appDir, "src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: path.join(appDir, "dist/index.js"),
  external: [...external],
  sourcemap: true,
  minify: true,
  logLevel: "info",
});

console.log(`[esbuild] ${appName}: bundled, ${external.size} external deps kept out of the bundle`);
