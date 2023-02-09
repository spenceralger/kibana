/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';

import { Package, getRepoRelsSync } from '@kbn/repo-packages';
import { RepoPath } from '@kbn/repo-path';
import { PackageFileMap } from '@kbn/repo-file-maps';

import { Bundle } from '../common';

interface Entry {
  pkgId: string;
  pluginId?: string;
  size?: number;
  targets?: string[];
  manifest?: string;
}

interface Group {
  entries: Entry[];
  size: number;
}

export function getDevBundles(packages: Package[], outputRoot: string, repoRoot: string) {
  return packages.map((pkg) => {
    const id = pkg.id;
    return new Bundle({
      id,
      manifestPaths: [Path.resolve(pkg.directory, 'kibana.jsonc')],
      outputDir: Path.resolve(outputRoot, 'target/bundles', id),
      sourceRoot: repoRoot,
      banner:
        `/*! Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one or more contributor license agreements.\n` +
        ` * Licensed under the Elastic License 2.0; you may not use this file except in compliance with the Elastic License 2.0. */\n`,
      entries: [
        {
          pkgId: pkg.id,
          targets: pkg.getPublicDirs(),
          pluginId: pkg.isPlugin() ? pkg.manifest.plugin.id : undefined,
        },
      ],
    });
  });
}

export function getDistBundles(packages: Package[], outputRoot: string, repoRoot: string) {
  const allFiles = getRepoRelsSync(repoRoot, ['**/public/**', '**/common/**']);
  const fileMap = new PackageFileMap(
    packages,
    Array.from(allFiles, (rel) => new RepoPath(repoRoot, rel))
  );

  const queue = packages.map(
    (pkg): Entry => ({
      pkgId: pkg.id,
      targets: pkg.getPublicDirs(),
      size: Array.from(fileMap.getFiles(pkg)).length * 0.5,
      pluginId: pkg.isPlugin() ? pkg.manifest.plugin.id : undefined,
    })
  );

  const pkgGroups: Group[] = Array.from(
    new Array(5),
    (): Group => ({
      entries: [],
      size: 0,
    })
  );

  for (const item of queue) {
    const group = pkgGroups[0];
    group.entries.push(item);
    group.size += item.size ?? 1;
    if (group.size > pkgGroups[1].size) {
      pkgGroups.sort((a, b) => a.size - b.size);
    }
  }

  return pkgGroups.map((group, i) => {
    const id = `zone${i + 1}`;
    return new Bundle({
      id,
      manifestPaths: group.entries.flatMap((e) => e.manifest || []),
      outputDir: Path.resolve(outputRoot, 'target/bundles', id),
      sourceRoot: repoRoot,
      banner:
        `/*! Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one or more contributor license agreements.\n` +
        ` * Licensed under the Elastic License 2.0; you may not use this file except in compliance with the Elastic License 2.0. */\n`,
      entries: group.entries.map((e) => ({
        pkgId: e.pkgId,
        targets: e.targets,
        pluginId: e.pluginId,
      })),
    });
  });
}
