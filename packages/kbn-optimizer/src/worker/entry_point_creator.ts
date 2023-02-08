/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

// TODO: we should be able to remove this ts-ignore while using isolatedModules
// this is a skip for the errors created when typechecking with isolatedModules
// @ts-ignore
module.exports = function ({
  bundleId,
  entries,
}: {
  bundleId: string;
  entries: Array<{ req: string; pluginId?: string }>;
}) {
  const id = JSON.stringify(bundleId)
  const lines = [
    `__webpack_public_path__ = window.__kbnBundles__.getPublicDir(${id});`,
    ...entries.flatMap((entry) => {
      const req = JSON.stringify(entry.req);
      return [
        `__kbnBundles__.define(${req}, __webpack_require__, require.resolve(${req}));`,
        entry.pluginId ? `__kbnBundles__.plugin(${JSON.stringify(entry.pluginId)}, ${req})` : [],
      ].flat();
    }),
    `__kbnBundles__.ready(${id})`
  ];

  return {
    code: lines.join('\n'),
  };
};
