/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

const Path = require('path');
const Fs = require('fs');

const { REPO_ROOT } = require('@kbn/repo-info');

const localDist = Path.resolve(__dirname, '../shared_built_assets');
const bazelDist = Path.resolve(REPO_ROOT, 'bazel-bin', Path.relative(REPO_ROOT, localDist));

// extracted const vars
/**
 * Absolute path to the distributable directory
 */
const distDir = Fs.existsSync(localDist) ? localDist : bazelDist;

/**
 * Filename of the main bundle file in the distributable directory
 */
const jsFilename = '@kbn/ui-shared-deps-src.js';

/**
 * Filename of the main bundle file in the distributable directory
 */
const cssDistFilename = '@kbn/ui-shared-deps-src.css';

/**
 * Externals mapping inteded to be used in a webpack config
 */
const externals = {
  /**
   * stateful deps
   */
  '@kbn/ui-theme': '__kbnBundles__.shared.KbnUiTheme',
  '@kbn/i18n': '__kbnBundles__.shared.KbnI18n',
  '@kbn/i18n-react': '__kbnBundles__.shared.KbnI18nReact',
  '@emotion/cache': '__kbnBundles__.shared.EmotionCache',
  '@emotion/react': '__kbnBundles__.shared.EmotionReact',
  jquery: '__kbnBundles__.shared.Jquery',
  moment: '__kbnBundles__.shared.Moment',
  'moment-timezone': '__kbnBundles__.shared.MomentTimezone',
  react: '__kbnBundles__.shared.React',
  'react-dom': '__kbnBundles__.shared.ReactDom',
  'react-dom/server': '__kbnBundles__.shared.ReactDomServer',
  'react-router': '__kbnBundles__.shared.ReactRouter',
  'react-router-dom': '__kbnBundles__.shared.ReactRouterDom',
  'styled-components': '__kbnBundles__.shared.StyledComponents',
  '@kbn/monaco': '__kbnBundles__.shared.KbnMonaco',
  // this is how plugins/consumers from npm load monaco
  'monaco-editor/esm/vs/editor/editor.api': '__kbnBundles__.shared.MonacoBarePluginApi',

  /**
   * big deps which are locked to a single version
   */
  rxjs: '__kbnBundles__.shared.Rxjs',
  'rxjs/operators': '__kbnBundles__.shared.RxjsOperators',
  numeral: '__kbnBundles__.shared.ElasticNumeral',
  '@elastic/numeral': '__kbnBundles__.shared.ElasticNumeral',
  '@elastic/charts': '__kbnBundles__.shared.ElasticCharts',
  '@kbn/datemath': '__kbnBundles__.shared.KbnDatemath',
  '@elastic/eui': '__kbnBundles__.shared.ElasticEui',
  '@elastic/eui/lib/services': '__kbnBundles__.shared.ElasticEuiLibServices',
  '@elastic/eui/lib/services/format': '__kbnBundles__.shared.ElasticEuiLibServicesFormat',
  '@elastic/eui/dist/eui_charts_theme': '__kbnBundles__.shared.ElasticEuiChartsTheme',

  // transient dep of eui
  'react-beautiful-dnd': '__kbnBundles__.shared.ReactBeautifulDnD',
  lodash: '__kbnBundles__.shared.Lodash',
  'lodash/fp': '__kbnBundles__.shared.LodashFp',
  fflate: '__kbnBundles__.shared.Fflate',

  /**
   * runtime deps which don't need to be copied across all bundles
   */
  tslib: '__kbnBundles__.shared.TsLib',
  uuid: '__kbnBundles__.shared.Uuid',
  '@kbn/analytics': '__kbnBundles__.shared.KbnAnalytics',
  '@kbn/es-query': '__kbnBundles__.shared.KbnEsQuery',
  '@kbn/std': '__kbnBundles__.shared.KbnStd',
  '@kbn/safer-lodash-set': '__kbnBundles__.shared.SaferLodashSet',
  '@kbn/rison': '__kbnBundles__.shared.KbnRison',
  history: '__kbnBundles__.shared.History',
  classnames: '__kbnBundles__.shared.Classnames',
  '@tanstack/react-query': '__kbnBundles__.shared.ReactQuery',
  '@tanstack/react-query-devtools': '__kbnBundles__.shared.ReactQueryDevtools',
};

module.exports = { distDir, jsFilename, cssDistFilename, externals };
