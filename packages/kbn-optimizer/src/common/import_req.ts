/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

export type ImportReq =
  | {
      pkgId: undefined;
      target: undefined;
      full: string;
    }
  | {
      pkgId: string;
      target: string;
      full: string;
    };

export function parseImportReq(importReq: string) {
  const segs = String(importReq).split('/');
  if (!segs[0] || segs[0] === '.' || segs[0] === '..') {
    return {
      pkgId: undefined,
      target: undefined,
      full: importReq,
    };
  }

  const [pkgId, target] = segs[0].startsWith('@')
    ? [`${segs[0]}/${segs[1]}`, segs.slice(2)]
    : [`${segs[0]}`, segs.slice(1)];

  return {
    pkgId,
    target: target.join('/'),
    full: importReq,
  };
}
