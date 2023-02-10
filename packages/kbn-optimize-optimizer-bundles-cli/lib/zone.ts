/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { Stats } from './stats';

export class Zone {
  constructor(
    private readonly stats: Stats,
    public readonly size = 0,
    public readonly pkgIds: readonly string[] = []
  ) {}

  /**
   * "add" a pkgId to this zone, producing a new Zone object with
   * the pkgId and all of it's unshared deps, and the updated "size"
   */
  add(rootPkgId: string) {
    let newSize = this.size;
    const newPkgIds = new Set(this.pkgIds);

    const queue = new Set([rootPkgId]);
    for (const pkgId of queue) {
      if (newPkgIds.has(pkgId)) {
        // dep is already in bundle
        continue;
      }

      const stat = this.stats.get(pkgId);
      if (stat.id !== rootPkgId && stat.shared) {
        // only the root shared pkg is added to the zone
        continue;
      }

      newSize += stat.size;
      newPkgIds.add(stat.id);
      for (const dep of stat.deps) {
        queue.add(dep);
      }
    }

    return new Zone(this.stats, newSize, Array.from(newPkgIds));
  }
}
