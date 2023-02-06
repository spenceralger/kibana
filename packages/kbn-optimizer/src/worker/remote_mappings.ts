/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { Chunk } from 'webpack';
import {
  isNormalModule,
  getModulePath,
  isConcatenatedModule,
} from '@kbn/optimizer-webpack-helpers';

import { BundleRemote } from '../common';

function getPathsFromModules(modules: any[]): string[] {
  return modules.flatMap((module): string | string[] => {
    if (isNormalModule(module)) {
      return getModulePath(module);
    }

    if (isConcatenatedModule(module)) {
      return getPathsFromModules(module.modules);
    }

    return [];
  });
}

export class RemoteMappings {
  map = new Map<string, Set<string>>();
  bundleRefsByChunk = new WeakMap<Chunk, Set<string>>();

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

  getBundleRefsForChunk(chunk: Chunk) {
    const cached = this.bundleRefsByChunk.get(chunk);
    if (cached) {
      return new Set(cached);
    }

    const referencedBundles = new Set(
      getPathsFromModules(Array.from(chunk.modulesIterable)).flatMap((p) =>
        Array.from(this.get(p) ?? [])
      )
    );
    this.bundleRefsByChunk.set(chunk, referencedBundles);
    return new Set(referencedBundles);
  }

  public get size() {
    return this.map.size;
  }
}
