/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Fs from 'fs';

import { REPO_ROOT } from '@kbn/repo-info';
import { run } from '@kbn/dev-cli-runner';
import { getPackages, getPluginPackagesFilter } from '@kbn/repo-packages';
import { DistBundleZones } from '@kbn/optimizer';

import { Stats } from './lib/stats';
import { Allocation } from './lib/allocation';
import { readExistingZones } from './lib/existing_zones';

const MAX_SIZE_DELTA = 50_000;
const MAX_SLOP_DELTA = 50_000;

run(
  async ({ log }) => {
    const allPackages = getPackages(REPO_ROOT);

    const pluginPkgIds = allPackages
      .filter(getPluginPackagesFilter({ browser: true, examples: false, testPlugins: false }))
      .map((p) => p.id);

    const sharedBundlePkgIds = allPackages
      .filter((p) => p.isBrowserCapablePackage() && !!p.manifest.sharedBrowserBundle)
      .map((p) => p.id);

    const allSharedPkgIds = new Set([...pluginPkgIds, ...sharedBundlePkgIds]);
    const stats = Stats.read(allSharedPkgIds);
    const alloc = Allocation.pick(stats, pluginPkgIds, allSharedPkgIds);

    log.info('ideal allocation seems to be:\n', JSON.stringify(alloc, null, 2));
    const existing = readExistingZones(stats, pluginPkgIds, allSharedPkgIds);

    if (existing) {
      const sizeDelta = alloc.avgSize - existing.avgSize;
      const slopDelta = Math.abs(alloc.slop - existing.slop);
      log.info(`deltas: [size=${sizeDelta}] [slop=${slopDelta}]`);
      if (sizeDelta < MAX_SIZE_DELTA && slopDelta < MAX_SLOP_DELTA) {
        log.success('existing optimizer config is good enough');
        return;
      }
    }

    Fs.writeFileSync(
      DistBundleZones.PATH,
      JSON.stringify(
        {
          zones: alloc.zones.map((z) => z.pkgIds),
          async: alloc.asyncPackages,
        },
        null,
        2
      ),
      'utf8'
    );

    log.warning('updated dist_bundle_zones.json config');
  },
  {
    description: `
      Consumes the pkg_stats.json file produced from --dist optimizer builds to
      update the optimizer zone map and improve the allocation of bundles to bundle
      zones.

      Writes output to the @kbn/optimizer's dist_bundle_zones.json file if a new
      allocation is determined to produce a significantly better balance.
    `,
  }
);
