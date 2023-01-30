/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Fs from 'fs';
import Path from 'path';

import { REPO_ROOT } from '@kbn/repo-info';

const BUNDLES_DIR = Path.resolve(REPO_ROOT, 'target/bundles');
const BUNDLE_ZONE_PATH = Path.resolve(BUNDLES_DIR, 'zones.json');

export interface BundleZones {
  init: string[];
  deps: Record<string, string[]>;
}

export function readZoneInfo(): BundleZones {
  return JSON.parse(Fs.readFileSync(BUNDLE_ZONE_PATH, 'utf8'));
}

export function updateZoneInfo(zones: BundleZones) {
  Fs.mkdirSync(BUNDLES_DIR, { recursive: true });
  Fs.writeFileSync(BUNDLE_ZONE_PATH, JSON.stringify(zones, null, 2));
}
