/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';

import webpack from 'webpack';
import { container } from 'webpack';
import TerserPlugin from 'terser-webpack-plugin';
import { CleanWebpackPlugin } from 'clean-webpack-plugin';
import CompressionPlugin from 'compression-webpack-plugin';

import { Bundle, BundleRemotes, WorkerConfig } from '../common';
import { RemoteMappings } from './bundle_remotes';
import { EmitStatsPlugin } from './emit_stats_plugin';
import { PopulateBundleCachePlugin } from './populate_bundle_cache_plugin';

const MOMENT_SRC = require.resolve('moment/min/moment-with-locales.js');
const WEBPACK_SRC = require.resolve('webpack');
const BABEL_PRESET = require.resolve('@kbn/babel-preset/webpack_preset');

export function getWebpackConfig(
  bundle: Bundle,
  bundleRemotes: BundleRemotes,
  worker: WorkerConfig
) {
  const ENTRY_CREATOR = require.resolve('./entry_point_creator.js');
  const remoteMappings = new RemoteMappings();

  const fileId = bundle.id.startsWith('@kbn/') ? bundle.id.slice(5) : bundle.id;

  const webpackConfig: webpack.Configuration = {
    mode: 'development',
    context: bundle.sourceRoot,
    cache: true,
    entry: {
      [bundle.id]: ENTRY_CREATOR,
    },

    devtool: worker.dist ? false : '#cheap-source-map',
    profile: worker.profileWebpack,

    output: {
      path: bundle.outputDir,
      filename: `${fileId}.js`,
      chunkFilename: `${fileId}.chunk.[id].js`,
      devtoolModuleFilenameTemplate: (info: any) =>
        `/${fileId}/${Path.relative(bundle.sourceRoot, info.absoluteResourcePath)}${info.query}`,
      chunkLoadingGlobal: `jsonp_webpack_${bundle.id}`,
      library: `__kbnBundles__.jsonp[${JSON.stringify(bundle.id)}]`,
      libraryTarget: 'jsonp',
    },

    optimization: {
      noEmitOnErrors: true,
      splitChunks: {
        maxAsyncRequests: 10,
        cacheGroups: {
          default: {
            reuseExistingChunk: false,
          },
        },
      },
    },

    plugins: [
      new CleanWebpackPlugin(),
      new PopulateBundleCachePlugin(worker, bundle, remoteMappings),
      ...(worker.profileWebpack ? [new EmitStatsPlugin(bundle)] : []),
      ...(bundle.banner ? [new webpack.BannerPlugin({ banner: bundle.banner, raw: true })] : []),
      new container.ModuleFederationPlugin({
        remotes: Object.fromEntries(
          Array.from(bundleRemotes.byPkgId.values(), (remote) => {
            return [
              remote.pkgId,
              `promise __kbnBundles__.getPkg(${JSON.stringify(remote.bundleId)}, ${JSON.stringify(
                remote.pkgId
              )})`,
            ];
          })
        ),
      }),
    ],

    module: {
      // no parse rules for a few known large packages which have no require() statements
      // or which have require() statements that should be ignored because the file is
      // already bundled with all its necessary dependencies
      noParse: [
        require.resolve('lodash/index.js'),
        require.resolve('vega/build/vega.js'),
        MOMENT_SRC as any,
        WEBPACK_SRC as any,
      ],

      rules: [
        {
          include: [ENTRY_CREATOR],
          use: [
            {
              loader: require.resolve('./public_path_loader'),
              options: {
                key: bundle.id,
              },
            },
            {
              loader: require.resolve('val-loader'),
              options: {
                entries: bundle.entries,
              },
            },
          ],
        },
        {
          test: /\.css$/,
          include: /node_modules/,
          use: [
            {
              loader: 'style-loader',
            },
            {
              loader: 'css-loader',
              options: {
                sourceMap: !worker.dist,
              },
            },
            {
              loader: 'postcss-loader',
              options: {
                sourceMap: !worker.dist,
                postcssOptions: {
                  config: require.resolve('../../postcss.config.js'),
                },
              },
            },
          ],
        },
        {
          test: /\.scss$/,
          exclude: /node_modules/,
          oneOf: [
            ...worker.themeTags.map((theme) => ({
              resourceQuery: `?${theme}`,
              use: [
                {
                  loader: 'style-loader',
                },
                {
                  loader: 'css-loader',
                  options: {
                    sourceMap: !worker.dist,
                  },
                },
                {
                  loader: 'postcss-loader',
                  options: {
                    sourceMap: !worker.dist,
                    postcssOptions: {
                      config: require.resolve('../../postcss.config.js'),
                    },
                  },
                },
                {
                  loader: 'sass-loader',
                  options: {
                    additionalData(content: string, loaderContext: webpack.LoaderContext<any>) {
                      const req = JSON.stringify(
                        loaderContext.utils.contextify(
                          loaderContext.context || loaderContext.rootContext,
                          Path.resolve(
                            worker.repoRoot,
                            `src/core/public/styles/core_app/_globals_${theme}.scss`
                          )
                        )
                      );
                      return `@import ${req};\n${content}`;
                    },
                    webpackImporter: false,
                    implementation: require('node-sass'),
                    sassOptions: {
                      outputStyle: worker.dist ? 'compressed' : 'nested',
                      includePaths: [Path.resolve(worker.repoRoot, 'node_modules')],
                      sourceMapRoot: `/${bundle.id}`,
                    },
                  },
                },
              ],
            })),
            {
              loader: require.resolve('./theme_loader'),
              options: {
                bundleId: bundle.id,
                themeTags: worker.themeTags,
              },
            },
          ],
        },
        {
          test: /\.(js|tsx?)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              babelrc: false,
              envName: worker.dist ? 'production' : 'development',
              presets: [BABEL_PRESET],
              plugins: [
                [
                  require.resolve('./bundle_remotes/babel_plugin'),
                  {
                    bundle,
                    remotes: bundleRemotes,
                    mappings: remoteMappings,
                  },
                ],
              ],
            },
          },
        },
        {
          test: /\.peggy$/,
          loader: require.resolve('@kbn/peggy-loader'),
        },
        // emits a separate file and exports the URL. Previously achievable by using file-loader.
        {
          test: [
            require.resolve('@mapbox/mapbox-gl-rtl-text/mapbox-gl-rtl-text.min.js'),
            require.resolve('maplibre-gl/dist/maplibre-gl-csp-worker'),
          ],
          type: 'asset/resource',
        },
        // exports the source code of the asset. Previously achievable by using raw-loader.
        {
          test: [/\.(html|md|txt|tmpl)$/],
          type: 'asset/source',
        },
        // automatically chooses between exporting a data URI and emitting a separate file. Previously achievable by using url-loader with asset size limit.
        {
          test: /\.(woff|woff2|ttf|eot|svg|ico|png|jpg|gif|jpeg)(\?|$)/,
          type: 'asset',
        },
      ],
    },

    resolve: {
      extensions: ['.js', '.ts', '.tsx', '.json'],
      mainFields: ['browser', 'main'],
      alias: {
        core_app_image_assets: Path.resolve(
          worker.repoRoot,
          'src/core/public/styles/core_app/images'
        ),
        vega: Path.resolve(worker.repoRoot, 'node_modules/vega/build-es5/vega.js'),
        '@elastic/eui$': '@elastic/eui/optimize/es',
        moment: MOMENT_SRC,
        // NOTE: Used to include react profiling on bundles
        // https://gist.github.com/bvaughn/25e6233aeb1b4f0cdb8d8366e54a3977#webpack-4
        'react-dom$': 'react-dom/profiling',
        'scheduler/tracing': 'scheduler/tracing-profiling',
        child_process: false,
        fs: false,
      },
    },

    performance: {
      // NOTE: we are disabling this as those hints
      // are more tailored for the final bundles result
      // and not for the webpack compilations performance itself
      hints: false,
    },
  };

  if (worker.dist) {
    webpackConfig.mode = 'production';
    webpackConfig.plugins?.push(
      new webpack.DefinePlugin({
        'process.env': {
          IS_KIBANA_DISTRIBUTABLE: `"true"`,
        },
      }),
      new CompressionPlugin({
        algorithm: 'brotliCompress',
        filename: '[path].br',
        test: /\.(js|css)$/,
        compressionOptions: {
          level: 11,
        },
      })
    );
    webpackConfig.optimization = {
      ...webpackConfig.optimization,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          parallel: false,
          terserOptions: {
            compress: { passes: 2 },
            keep_classnames: true,
            mangle: true,
          },
        }),
      ],
    };
  }

  return webpackConfig;
}
