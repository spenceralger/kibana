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

const BUNDLE_INFO_PATH = Path.resolve(REPO_ROOT, 'target/bundles/info.json');

export type BundleDeps = Record<string, string[]>;

export function readBundleDeps(): BundleDeps {
  try {
    return JSON.parse(Fs.readFileSync(BUNDLE_INFO_PATH, 'utf8')).deps;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }

    throw error;
  }
}
