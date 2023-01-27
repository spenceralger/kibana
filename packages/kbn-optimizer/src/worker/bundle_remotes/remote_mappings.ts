/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { BundleRemote } from '../../common';

export class RemoteMappings {
  map = new Map<string, Set<string>>();

  add(path: string, bundleRemote: BundleRemote) {
    const group = this.map.get(path);
    if (!group) {
      this.map.set(path, new Set([bundleRemote.bundleId]));
    } else {
      group.add(bundleRemote.bundleId);
    }
  }

  get(path: string) {
    return this.map.get(path);
  }
}
