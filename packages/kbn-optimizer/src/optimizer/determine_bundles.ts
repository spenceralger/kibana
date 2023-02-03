/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';

import { Package } from '@kbn/repo-packages';

import { Bundle } from '../common';

export function getDevBundles(packages: Package[], outputRoot: string, repoRoot: string) {
  return [
    new Bundle({
      id: 'npm',
      sourceRoot: repoRoot,
      outputDir: Path.resolve(outputRoot, 'target/bundles/npm'),
      banner: 'this is code from NPM!',
      entries: [
        { pkgId: 'lodash', targets: ['', 'fp'] },
        {
          pkgId: '@elastic/eui',
          targets: [
            '',
            'optimize/es/services',
            'optimize/es/services/format',
            'dist/eui_charts_theme',
            'dist/eui_theme_light.json',
            'dist/eui_theme_dark.json',
          ],
        },
        { pkgId: '@elastic/charts' },
        { pkgId: '@emotion/cache' },
        { pkgId: '@emotion/react' },
        { pkgId: 'jquery' },
        { pkgId: 'moment-timezone', targets: ['moment-timezone', 'data/packed/latest.json'] },
        { pkgId: 'moment' },
        { pkgId: 'react' },
        { pkgId: 'react-ace' },
        { pkgId: 'react-beautiful-dnd' },
        { pkgId: 'react-dom', targets: ['', 'server'] },
        { pkgId: 'react-router-dom' },
        { pkgId: 'react-router' },
        { pkgId: 'rxjs', targets: ['', 'operators'] },
        { pkgId: 'styled-components' },
        { pkgId: 'tslib' },
        { pkgId: 'uuid' },
      ],
    }),
    ...packages.map((pkg) => {
      return new Bundle({
        id: pkg.id,
        sourceRoot: repoRoot,
        outputDir: Path.resolve(outputRoot, 'target/bundles', pkg.id),
        banner:
          `/*! Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one or more contributor license agreements.\n` +
          ` * Licensed under the Elastic License 2.0; you may not use this file except in compliance with the Elastic License 2.0. */\n`,
        entries: [
          {
            pkgId: pkg.id,
            targets: pkg.isPlugin()
              ? Array.from(new Set(['public', ...(pkg.manifest.plugin.extraPublicDirs ?? [])]))
              : [''],
          },
        ],
      });
    }),
  ];
}
