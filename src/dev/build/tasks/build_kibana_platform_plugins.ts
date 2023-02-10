/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';

import { REPO_ROOT } from '@kbn/repo-info';
import { lastValueFrom } from 'rxjs';
import {
  runOptimizer,
  OptimizerConfig,
  logOptimizerState,
  reportOptimizerTimings,
} from '@kbn/optimizer';

import { Task } from '../lib';

export const BuildKibanaPlatformPlugins: Task = {
  description: 'Building distributable versions of Kibana platform plugins',
  async run(buildConfig, log, build) {
    const config = OptimizerConfig.create({
      repoRoot: REPO_ROOT,
      outputRoot: build.resolvePath(),
      cache: false,
      watch: false,
      dist: true,
      inspectWorkers: false,
      limitsPath: Path.resolve(REPO_ROOT, 'packages/kbn-optimizer/limits.yml'),
      examples: buildConfig.pluginSelector.examples,
      testPlugins: buildConfig.pluginSelector.testPlugins,
    });

    await lastValueFrom(
      runOptimizer(config).pipe(logOptimizerState(log, config), reportOptimizerTimings(log, config))
    );

    // delete all bundle cache files
    await Promise.all(config.bundles.map((b) => b.cache.clear()));
  },
};
