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

const BUNDLE_COUNT = 5;
interface BundleGroup {
  pkgs: Package[];
  size: number;
}

export function determineBundles(packages: Package[], outputRoot: string, repoRoot: string) {
  const groups: BundleGroup[] = [];
  for (let i = 0; i < BUNDLE_COUNT; i++) {
    groups.push({ pkgs: [], size: 0 });
  }

  // TODO: We should use herusitics and a config file on disk to build these groups
  for (const pkg of packages) {
    groups[0].pkgs.push(pkg);
    groups[0].size += 1;
    groups.sort((a, b) => a.size - b.size);
  }

  const bundles: Bundle[] = [];
  for (const group of groups) {
    const id = `zone${bundles.length + 1}`;
    bundles.push(
      new Bundle({
        id,
        sourceRoot: repoRoot,
        outputDir: Path.resolve(outputRoot, 'target/bundles', id),
        banner:
          `/*! Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one or more contributor license agreements.\n` +
          ` * Licensed under the Elastic License 2.0; you may not use this file except in compliance with the Elastic License 2.0. */\n`,
        entries: group.pkgs.map((p) => ({
          pkgId: p.id,
          targets: p.isPlugin()
            ? Array.from(new Set(['public', ...(p.manifest.plugin.extraPublicDirs ?? [])]))
            : [''],
        })),
      })
    );
  }

  bundles.push(
    new Bundle({
      id: 'npm',
      sourceRoot: repoRoot,
      outputDir: Path.resolve(outputRoot, 'target/bundles/npm'),
      entries: [
        // polyfill code
        { pkgId: 'core-js', targets: ['stable'] },
        { pkgId: 'whatwg-fetch' },
        { pkgId: 'symbol-observable' },

        // Parts of node-libs-browser that are used in many places across Kibana
        { pkgId: 'buffer' },
        { pkgId: 'punycode' },
        { pkgId: 'util' },

        /**
         * babel runtime helpers referenced from entry chunks
         * determined by running:
         *
         *  node scripts/build_kibana_platform_plugins --dist --profile
         *  node scripts/find_babel_runtime_helpers_in_use.js
         */
        {
          pkgId: '@babel/runtime',
          targets: [
            'helpers/assertThisInitialized',
            'helpers/asyncToGenerator',
            'helpers/classCallCheck',
            'helpers/classPrivateFieldGet',
            'helpers/classPrivateFieldSet',
            'helpers/createClass',
            'helpers/createForOfIteratorHelper',
            'helpers/createSuper',
            'helpers/defineProperty',
            'helpers/extends',
            'helpers/inherits',
            'helpers/inheritsLoose',
            'helpers/interopRequireDefault',
            'helpers/interopRequireWildcard',
            'helpers/objectSpread2',
            'helpers/objectWithoutProperties',
            'helpers/objectWithoutPropertiesLoose',
            'helpers/slicedToArray',
            'helpers/taggedTemplateLiteralLoose',
            'helpers/toConsumableArray',
            'helpers/typeof',
            'helpers/wrapNativeSuper',
            'regenerator',
          ],
        },

        // modules from npm
        {
          pkgId: '@elastic/charts',
        },
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
        { pkgId: '@elastic/numeral' },
        { pkgId: '@emotion/cache' },
        { pkgId: '@emotion/react' },
        { pkgId: '@tanstack/react-query' },
        { pkgId: '@tanstack/react-query-devtools' },
        { pkgId: 'classnames' },
        { pkgId: 'fflate' },
        { pkgId: 'history' },
        { pkgId: 'jquery' },
        { pkgId: 'lodash', targets: ['', 'fp'] },
        { pkgId: 'moment-timezone', targets: ['moment-timezone', 'data/packed/latest.json'] },
        { pkgId: 'moment' },
        { pkgId: 'react-ace' },
        { pkgId: 'react-beautiful-dnd' },
        { pkgId: 'react-dom', targets: ['', 'server'] },
        { pkgId: 'react-router-dom' },
        { pkgId: 'react-router' },
        { pkgId: 'react' },
        { pkgId: 'rxjs', targets: ['', 'operators'] },
        { pkgId: 'styled-components' },
        { pkgId: 'tslib' },
        { pkgId: 'uuid' },
      ],
    })
  );

  return bundles;
}
