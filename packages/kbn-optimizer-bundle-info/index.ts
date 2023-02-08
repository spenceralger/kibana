/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Fs from 'fs';
import Path from 'path';

import { PKG_JSON } from '@kbn/repo-info';
import { REPO_ROOT } from '@kbn/repo-info';

const BUNDLE_INFO_PATH = Path.resolve(REPO_ROOT, 'target/bundles/info.json');

export type BundleDeps = Record<string, string[]>;
export type BundlePkgs = Record<string, string[]>;

const IS_DIST = !!PKG_JSON.build.distributable;

function maybeCache<T>(fn: () => T) {
  let cache: T | undefined;
  return () => {
    if (IS_DIST && cache !== undefined) {
      return cache;
    }

    const value = fn();

    if (IS_DIST) {
      cache = value;
    }

    return value;
  };
}

const getBundleInfo = maybeCache((): { deps: BundleDeps; pkgs: BundlePkgs } => {
  try {
    return JSON.parse(Fs.readFileSync(BUNDLE_INFO_PATH, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    return {
      deps: {},
      pkgs: {},
    };
  }
});

export function getBundleDeps() {
  return getBundleInfo().deps;
}

export function getBundlePkgs() {
  return getBundleInfo().pkgs;
}

export const getBundleIdsByPkgIds = maybeCache(() => {
  const pkgsByBundleId = getBundlePkgs();
  return new Map(
    Object.entries(pkgsByBundleId).flatMap(([bundleId, pkgs]) => {
      return pkgs.map((pkgId) => [pkgId, bundleId]);
    })
  );
});
