/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import type { NodePath } from '@babel/traverse';
import type { PluginPass } from '@babel/core';
import * as T from '@babel/types';
import { declare } from '@babel/helper-plugin-utils';
import { Bundle, BundleRemotes } from '../common';
import { RemoteMappings } from './remote_mappings';

function isDynamicImport(
  node: T.CallExpression
): node is T.CallExpression & { callee: T.Import; arguments: [T.StringLiteral] } {
  return !!(
    T.isImport(node.callee) &&
    node.arguments.length === 1 &&
    T.isStringLiteral(node.arguments[0])
  );
}

function isRequire(
  node: T.CallExpression
): node is T.CallExpression & { arguments: [T.StringLiteral] } {
  return !!(
    T.isIdentifier(node.callee) &&
    node.callee.name === 'require' &&
    node.arguments.length >= 1 &&
    T.isStringLiteral(node.arguments[0])
  );
}

module.exports = declare((api, options) => {
  api.assertVersion(7);

  const { bundle, remotes, mappings } = options;
  if (!(bundle instanceof Bundle)) {
    throw new Error('options.bundle must be an instance of the Bundle class');
  }
  if (!(remotes instanceof BundleRemotes)) {
    throw new Error('options.remotes must be an instance of the BundleRemotes class');
  }
  if (!(mappings instanceof RemoteMappings)) {
    throw new Error('options.mappings must be an instance of the RemoteMappings class');
  }

  function trackRemotes(pp: PluginPass, req: string) {
    const { parsed, remote } = remotes.get(req);
    if (parsed && remote) {
      mappings.add(pp.filename, remote);
    }
  }

  return {
    name: 'kbn-remote-bundle-refs',
    visitor: {
      'ImportDeclaration|ExportNamedDeclaration|ExportAllDeclaration'(
        this: PluginPass,
        path: NodePath<T.ImportDeclaration | T.ExportNamedDeclaration | T.ExportAllDeclaration>
      ) {
        const source = path.node.source;
        if (!T.isStringLiteral(source)) {
          return;
        }
        trackRemotes(this, source.value);
      },

      CallExpression(path) {
        const { node } = path;
        if (!isDynamicImport(node) && !isRequire(node)) {
          return;
        }

        trackRemotes(this, node.arguments[0].value);
      },
    },
  };
});
