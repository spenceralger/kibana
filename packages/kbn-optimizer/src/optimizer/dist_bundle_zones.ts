/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Fs from 'fs';

import { Package } from '@kbn/repo-packages';
import { Bundle } from '../common';

const CONFIG_PATH = require.resolve('../../dist_bundle_zones.json');

interface BundleZoneManifest {
  entry?: string[][];
  async?: string[];
}

export class DistBundleZones {
  static read(): BundleZoneManifest {
    try {
      return JSON.parse(Fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      return {};
    }
  }

  static load(sourceRoot: string, outputRoot: string, packages: Package[]) {
    const manifest = DistBundleZones.read();
    const unassigned = new Map(packages.map((p) => [p.id, p]));

    const entryBundles = Array.from((manifest.entry ?? []).entries(), ([i, pkgIds]) => {
      const pkgs = pkgIds.flatMap((pkgId) => unassigned.get(pkgId) ?? []);
      for (const pkg of pkgs) {
        unassigned.delete(pkg.id);
      }

      return Bundle.forPkgs(sourceRoot, outputRoot, pkgs, `zone${i + 1}`);
    });

    const asyncBundles = (manifest.async ?? []).flatMap((pkgId) => {
      const pkg = unassigned.get(pkgId);
      if (!pkg) {
        return [];
      }

      unassigned.delete(pkgId);
      return Bundle.forPkg(sourceRoot, outputRoot, pkg);
    });

    for (const pkg of unassigned.values()) {
      entryBundles.push(Bundle.forPkg(sourceRoot, outputRoot, pkg));
    }

    return [...entryBundles, ...asyncBundles];
  }
}
