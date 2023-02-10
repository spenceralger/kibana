/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';
import Fs from 'fs';

import { REPO_ROOT } from '@kbn/repo-info';
import { fail } from './fail';

export interface PkgStats {
  id: string;
  size: number;
  deps: string[];
}

export class Stats {
  static read(allSharedPkgIds: Set<string>) {
    try {
      return new Stats(
        (
          JSON.parse(
            Fs.readFileSync(Path.resolve(REPO_ROOT, 'target/bundles/pkg_stats.json'), 'utf8')
          ).pkgStats as PkgStats[]
        ).map((stats) => ({
          ...stats,
          shared: allSharedPkgIds.has(stats.id),
        }))
      );
    } catch (error) {
      if (error.code === 'ENOENT') {
        fail('target/bundles/pkg_stats.json is missing');
      }

      throw error;
    }
  }

  private map = new Map<string, PkgStats & { shared: boolean }>();

  constructor(pkgStats: Array<PkgStats & { shared: boolean }>) {
    for (const stats of pkgStats) {
      this.map.set(stats.id, stats);
    }
  }

  get(pkgId: string) {
    const stat = this.map.get(pkgId);
    if (!stat) {
      fail(`missing stats for pkg "${pkgId}"`);
    }
    return stat;
  }
}
