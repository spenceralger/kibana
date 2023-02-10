/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { Stats } from './stats';
import { Zone } from './zone';
import { fail } from './fail';

interface AllocationZone {
  size: number;
  pkgIds: string[];
}

export class Allocation {
  static pick(stats: Stats, entryPkgIds: string[], allSharedPkgIds: Set<string>) {
    const sizeCache = new Map<string, number>();
    function getFullSize(start: string) {
      const cached = sizeCache.get(start);
      if (cached !== undefined) {
        return cached;
      }

      let size = 0;

      const queue = new Set([start]);
      for (const pkgId of queue) {
        const stat = stats.get(pkgId);
        if (!stat) {
          fail(`unknown pkg ${pkgId}`);
        }

        size += stat.size;
        for (const dep of stat.deps) {
          queue.add(dep);
        }
      }

      sizeCache.set(start, size);
      return size;
    }

    // start an empty allocation and then assign each plugin in order based on size
    let alloc = new Allocation(
      stats,
      [new Zone(stats), new Zone(stats), new Zone(stats), new Zone(stats), new Zone(stats)],
      0
    );

    // sort the plugins and assign them to the allocation from the largest to
    // the smallest so that we can really pack the zones full
    const sortedPkgIdsToAssign = Array.from(
      new Set([
        ...entryPkgIds,
        ...entryPkgIds.flatMap((id) =>
          stats.get(id).deps.filter((dep) => allSharedPkgIds.has(dep))
        ),
      ])
    ).sort((a, b) => getFullSize(b) - getFullSize(a));
    for (const p of sortedPkgIdsToAssign) {
      alloc = alloc.autoAssign(p);
    }

    const zones = alloc.zones.map(
      (z): AllocationZone => ({
        size: Math.round(z.size),
        pkgIds: z.pkgIds.filter((id) => allSharedPkgIds.has(id)),
      })
    );

    const sizes = zones.map((z) => z.size);
    const allSyncPkgIds = new Set(sortedPkgIdsToAssign);

    return {
      avgSize: Math.round(sizes.reduce((a, b) => a + b) / zones.length),
      slop: Math.max(...sizes) - Math.min(...sizes),
      zones,
      asyncPackages: Array.from(allSharedPkgIds).filter((id) => !allSyncPkgIds.has(id)),
    };
  }

  constructor(
    private readonly stats: Stats,
    private readonly zones: Zone[],
    public readonly slop: number
  ) {}

  /**
   * Assign the pkgId to temporary versions of all the zones, then
   * keep the assignment which produces the lowest possible slop for
   * the allocation.
   */
  autoAssign(pkgId: string) {
    let best;
    for (let z = 0; z < 5; z++) {
      const sizes: number[] = [];
      const newZones: Zone[] = [];

      for (const [i, old] of this.zones.entries()) {
        if (i !== z) {
          sizes.push(old.size);
          newZones.push(old);
          continue;
        }

        const zone = old.add(pkgId);
        sizes.push(zone.size);
        newZones.push(zone);
      }

      const slop = Math.max(...sizes) - Math.min(...sizes);
      if (!best || best.slop > slop) {
        best = new Allocation(this.stats, newZones, slop);
      }
    }

    if (!best) {
      fail('invalid state');
    }

    return best;
  }
}
