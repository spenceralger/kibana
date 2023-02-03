/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Fs from 'fs';
import Path from 'path';
import * as T from '@babel/types';

import Externals from '../lib/external_packages.js';
import { REPO_ROOT } from '../lib/paths.mjs';

/** @type {import('../lib/command').Command} */
export const command = {
  name: '_x',
  async run() {
    const { getPackages } = Externals['@kbn/repo-packages']();
    const { removeProp, getProp, setProp } = Externals['@kbn/json-ast']();

    for (const pkg of getPackages(REPO_ROOT)) {
      if (pkg.manifest.type !== 'plugin' || !pkg.manifest.plugin.extraPublicDirs) {
        return;
      }

      const path = Path.resolve(pkg.directory, 'kibana.jsonc');
      let jsonc = Fs.readFileSync(path, 'utf8');
      const prop = getProp(jsonc, 'plugin');
      if (!T.isObjectExpression(prop)) {
        throw new Error('expected plugin property to be an object');
      }

      jsonc = removeProp(jsonc, 'extraPublicDirs', { node: prop });
      jsonc = setProp(jsonc, 'publicDirs', pkg.manifest.plugin.extraPublicDirs);
      Fs.writeFileSync(path, jsonc);
    }
  },
};
