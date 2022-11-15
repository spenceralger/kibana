/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Fs from 'fs';
import Path from 'path';

import { REPO_ROOT } from '../lib/paths.mjs';
// import { pluginDiscovery } from './bootstrap/plugins.mjs';

/** @type {import('../lib/command').Command} */
export const command = {
  name: '_x',
  async run({ log }) {
    const { discoverBazelPackages } = await import('@kbn/bazel-packages');
    /** @type {Record<string, string>} */
    const workspacePaths = {};

    for (const pkg of await discoverBazelPackages(REPO_ROOT)) {
      const dir = Path.resolve(REPO_ROOT, pkg.normalizedRepoRelativeDir);

      workspacePaths[pkg.manifest.id] = pkg.normalizedRepoRelativeDir;

      const projectJson = JSON.stringify(
        {
          $schema: Path.relative(
            Path.resolve(REPO_ROOT, pkg.normalizedRepoRelativeDir),
            Path.resolve(REPO_ROOT, 'node_modules/nx/schemas/project-schema.json')
          ),
          name: pkg.manifest.id,
          projectType: 'library',
          targets: {
            buildTypes: {
              executor: '@kbn/nx:buildTypes',
            },
            checkTypes: {
              executor: '@kbn/nx:checkTypes',
            },
          },
          tags: ['shared-common'],
        },
        null,
        2
      );

      Fs.writeFileSync(Path.resolve(dir, 'project.json'), projectJson);
    }

    const workspacePath = Path.resolve(REPO_ROOT, 'workspace.json');
    Fs.writeFileSync(
      workspacePath,
      JSON.stringify(
        {
          ...JSON.parse(Fs.readFileSync(workspacePath, 'utf8')),
          projects: {
            '@kbn/nx': 'nx',
            ...workspacePaths,
          },
        },
        null,
        2
      )
    );

    // for (const plugin of await pluginDiscovery()) {
    //   Fs.writeFileSync(Path.resolve(plugin.directory, 'project.json'), projectJson);
    // }

    log.success(`added project.json files to all packages and plugins`);
  },
};
