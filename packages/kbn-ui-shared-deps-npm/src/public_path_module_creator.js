/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

/**
 * @param {{ bundleId: string }} param0
 */
module.exports = function ({ bundleId }) {
  const id = JSON.stringify(bundleId);
  return {
    code: `__webpack_public_path__ = window.__kbnBundles__.getPublicDir(${id})`,
  };
};
