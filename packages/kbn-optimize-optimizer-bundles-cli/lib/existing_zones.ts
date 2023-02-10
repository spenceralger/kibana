/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { DistBundleZones } from '@kbn/optimizer';
import { Stats } from './stats';

function diff(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) {
    return true;
  }

  for (const item of a) {
    if (!b.has(item)) {
      return true;
    }
  }

  return false;
}

export function readExistingZones(
  stats: Stats,
  pluginPkgIds: string[],
  allSharedPkgIds: Set<string>
) {
  const manifest = DistBundleZones.read();
  const existingZones = manifest.zones ?? [];
  const existingAsync = manifest.async ?? [];

  const existingZoneIds = new Set(existingZones.flat());

  // verify that the existing config is useful with a few assertions:
  if (existingZones.length !== 5) {
    // there must be exactly 5 zones
    return undefined;
  }
  if (diff(new Set([...existingZoneIds, ...existingAsync]), allSharedPkgIds)) {
    // the set of pkgIds between the zones and async list must match
    return undefined;
  }
  if (pluginPkgIds.some((id) => !existingZoneIds.has(id))) {
    // every pluginPkgId must be in the "zones" list somewhere
    return undefined;
  }

  const sizes: number[] = [];
  for (const zone of existingZones) {
    let size = 0;
    const queue = new Set(zone);
    for (const pkgId of queue) {
      const stat = stats.get(pkgId);
      if (stat.shared && !zone.includes(pkgId)) {
        // ignore shared deps which aren't in this zone
        continue;
      }

      size += stat.size;
      for (const dep of stat.deps) {
        queue.add(dep);
      }
    }
    sizes.push(size);
  }

  return {
    avgSize: sizes.reduce((a, b) => a + b) / sizes.length,
    slop: Math.max(...sizes) - Math.min(...sizes),
  };
}
