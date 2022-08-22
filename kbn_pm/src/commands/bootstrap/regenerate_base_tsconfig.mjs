/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';
import Fs from 'fs';

import { REPO_ROOT } from '../../lib/paths.mjs';
import { convertPluginIdToPackageId } from './plugins.mjs';
import { normalizePath } from './normalize_path.mjs';

/**
 * @param {import('@kbn/plugin-discovery').KibanaPlatformPlugin[]} plugins
 * @param {import('@kbn/bazel-packages').BazelPackage[]} packages
 */
export function regenerateBaseTsconfig(plugins, packages) {
  const tsconfigPath = Path.resolve(REPO_ROOT, 'tsconfig.base.json');
  const lines = Fs.readFileSync(tsconfigPath, 'utf-8').split('\n');

  const packagesMap = packages
    .slice()
    .sort((a, b) => a.normalizedRepoRelativeDir.localeCompare(b.normalizedRepoRelativeDir))
    .flatMap((p) => {
      const id = p.pkg.name
      const path = p.normalizedRepoRelativeDir
      // return [`      "${id}": ["${path}"],`, `      "${id}/*": ["${path}/*"],`];
      // return [`      "${id}": ["node_modules/@types/${id.replace("@", "").replace("/", "__")}", "bazel-out/darwin-fastbuild/bin/${path}/target_types", "bazel-out/darwin_arm64-fastbuild/bin/${path}/target_types", "bazel-out/k8-fastbuild/bin/${path}/target_types", "bazel-out/x64_windows-fastbuild/bin/${path}/target_types"],`,];
      return [`      "${id}": ["bazel-out/darwin_arm64-fastbuild/bin/${path}/target_types"],`,];
    });

  const pluginsMap = plugins
    .slice()
    .sort((a, b) => a.manifestPath.localeCompare(b.manifestPath))
    .flatMap((p) => {
      const id = convertPluginIdToPackageId(p.manifest.id);
      const path = normalizePath(Path.relative(REPO_ROOT, p.directory));
      return [`      "${id}": ["${path}"],`, `      "${id}/*": ["${path}/*"],`];
    });

  const start = lines.findIndex((l) => l.trim() === '// START AUTOMATED PACKAGE LISTING');
  const end = lines.findIndex((l) => l.trim() === '// END AUTOMATED PACKAGE LISTING');

  Fs.writeFileSync(
    tsconfigPath,
    [...lines.slice(0, start + 1), ...packagesMap, ...pluginsMap, ...lines.slice(end)].join('\n')
  );
}
