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
module.exports = function ({ id, reqs }: { id: string; reqs: string[] }) {
  const lines = [
    `__webpack_public_path__ = window.__kbnBundles__.getPublicDir(${JSON.stringify(id)});`,
    ...reqs
      .map((req) => JSON.stringify(req))
      .map((req) => `__kbnBundles__.define(${req}, __webpack_require__, require.resolve(${req}));`),
  ];

  return {
    code: lines.join('\n'),
  };
};
