/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { Package } from '@kbn/repo-packages';

import { DistBundleZones } from './dist_bundle_zones';
import { Bundle } from '../common';

export function getDevBundles(sourceRoot: string, outputRoot: string, packages: Package[]) {
  return packages.map((pkg) => Bundle.forPkg(sourceRoot, outputRoot, pkg));
}

export function getDistBundles(sourceRoot: string, outputRoot: string, packages: Package[]) {
  return DistBundleZones.load(sourceRoot, outputRoot, packages);
}
