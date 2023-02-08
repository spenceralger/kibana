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
  '@kbn/ui-theme': '__kbn.exports.shared.KbnUiTheme',
  '@kbn/i18n': '__kbn.exports.shared.KbnI18n',
  '@kbn/i18n-react': '__kbn.exports.shared.KbnI18nReact',
  '@emotion/cache': '__kbn.exports.shared.EmotionCache',
  '@emotion/react': '__kbn.exports.shared.EmotionReact',
  jquery: '__kbn.exports.shared.Jquery',
  moment: '__kbn.exports.shared.Moment',
  'moment-timezone': '__kbn.exports.shared.MomentTimezone',
  react: '__kbn.exports.shared.React',
  'react-dom': '__kbn.exports.shared.ReactDom',
  'react-dom/server': '__kbn.exports.shared.ReactDomServer',
  'react-router': '__kbn.exports.shared.ReactRouter',
  'react-router-dom': '__kbn.exports.shared.ReactRouterDom',
  'styled-components': '__kbn.exports.shared.StyledComponents',
  '@kbn/monaco': '__kbn.exports.shared.KbnMonaco',
  // this is how plugins/consumers from npm load monaco
  'monaco-editor/esm/vs/editor/editor.api': '__kbn.exports.shared.MonacoBarePluginApi',

  /**
   * big deps which are locked to a single version
   */
  rxjs: '__kbn.exports.shared.Rxjs',
  'rxjs/operators': '__kbn.exports.shared.RxjsOperators',
  numeral: '__kbn.exports.shared.ElasticNumeral',
  '@elastic/numeral': '__kbn.exports.shared.ElasticNumeral',
  '@elastic/charts': '__kbn.exports.shared.ElasticCharts',
  '@kbn/datemath': '__kbn.exports.shared.KbnDatemath',
  '@elastic/eui': '__kbn.exports.shared.ElasticEui',
  '@elastic/eui/lib/services': '__kbn.exports.shared.ElasticEuiLibServices',
  '@elastic/eui/lib/services/format': '__kbn.exports.shared.ElasticEuiLibServicesFormat',
  '@elastic/eui/dist/eui_charts_theme': '__kbn.exports.shared.ElasticEuiChartsTheme',

  // transient dep of eui
  'react-beautiful-dnd': '__kbn.exports.shared.ReactBeautifulDnD',
  lodash: '__kbn.exports.shared.Lodash',
  'lodash/fp': '__kbn.exports.shared.LodashFp',
  fflate: '__kbn.exports.shared.Fflate',

  /**
   * runtime deps which don't need to be copied across all bundles
   */
  tslib: '__kbn.exports.shared.TsLib',
  uuid: '__kbn.exports.shared.Uuid',
  '@kbn/analytics': '__kbn.exports.shared.KbnAnalytics',
  '@kbn/es-query': '__kbn.exports.shared.KbnEsQuery',
  '@kbn/std': '__kbn.exports.shared.KbnStd',
  '@kbn/safer-lodash-set': '__kbn.exports.shared.SaferLodashSet',
  '@kbn/rison': '__kbn.exports.shared.KbnRison',
  history: '__kbn.exports.shared.History',
  classnames: '__kbn.exports.shared.Classnames',
  '@tanstack/react-query': '__kbn.exports.shared.ReactQuery',
  '@tanstack/react-query-devtools': '__kbn.exports.shared.ReactQueryDevtools',
};

module.exports = { distDir, jsFilename, cssDistFilename, externals };
