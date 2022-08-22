/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { REPO_ROOT } from '../../lib/paths.mjs';

/** @type {string} */
const KBN_BAZEL_PACKAGES_SRC = '../../../../packages/kbn-bazel-packages/src/index.js';

/**
 * @returns {Promise<import('@kbn/bazel-packages').BazelPackage[]>}
 */
export async function packagesDiscovery() {
  /* eslint-disable no-unsanitized/method */
  /** @type {import('@kbn/bazel-packages')} */
  const { discoverBazelPackages } = await import(
    KBN_BAZEL_PACKAGES_SRC
  );
  /* eslint-enable no-unsanitized/method */

  return await discoverBazelPackages(REPO_ROOT);
}
