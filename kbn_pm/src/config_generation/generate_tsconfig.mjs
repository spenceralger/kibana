/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';
import Fsp from 'fs/promises';

import { REPO_ROOT } from '../lib/paths.mjs';
import { asyncMapWithLimit } from '../lib/async.mjs';

const BASE_TSCONFIG = Path.resolve(REPO_ROOT, 'tsconfig.bazel.json');

/**
 * @param {import('@kbn/bazel-packages').KibanaPackageManifest} manifest
 * @param {string} normalizedRepoRelativePkgDir
 */
export function getTsConfig(manifest, normalizedRepoRelativePkgDir) {
  return {
    extends: Path.relative(Path.resolve(REPO_ROOT, normalizedRepoRelativePkgDir), BASE_TSCONFIG),
    compilerOptions: {
      rootDir: '.',
      allowJs: true,
      checkJs: true,
      declaration: true,
      declarationMap: true,
      emitDeclarationOnly: true,
      outDir: './target_types',
      stripInternal: false,
      types: /** @type {any} */ (manifest.__deprecated__TalkToOperationsIfYouThinkYouNeedThis)
        ?.pkgJsonOverrides?.browser
        ? ['node', 'jest', 'react']
        : ['node', 'jest'],
    },
    include: ['**/*.{ts,tsx,js,jsx}'],
  };
}

/**
 * @param {import('@kbn/bazel-packages').BazelPackage[]} pkgs
 */
export async function generatePackageJsons(pkgs) {
  await asyncMapWithLimit(pkgs, 50, async (pkg) => {
    const pkgJson = getTsConfig(pkg.manifest, pkg.normalizedRepoRelativeDir);
    const path = Path.resolve(REPO_ROOT, pkg.normalizedRepoRelativeDir, 'tsconfig.json');
    await Fsp.writeFile(path, JSON.stringify(pkgJson, null, 2));
  });
}
