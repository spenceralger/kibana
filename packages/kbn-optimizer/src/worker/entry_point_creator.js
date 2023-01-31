/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

/** @param {{ entries: BundleEntry[] }} opts */
module.exports = function (opts) {
  return {
    code: `${opts.entries
      .flatMap((entry) =>
        entry.targets
          .map((dir) => (dir ? `${entry.pkgId}/${dir}` : entry.pkgId))
          .map((importReq) => `import(/* webpackMode: "eager" */ ${JSON.stringify(importReq)});`)
      )
      .join('\n')}`,
  };
};
