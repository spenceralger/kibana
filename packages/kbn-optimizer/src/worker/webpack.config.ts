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
import { RemoteMappings } from './remote_mappings';
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

  const resolvedBundleEntryAliases = Object.fromEntries(
    bundle.entries.flatMap((e) => {
      if (!e.pkgId.startsWith('@kbn/')) {
        return [];
      }

      return e.targets.map((target) => {
        const req = target ? `${e.pkgId}/${target}` : e.pkgId;
        let path;
        try {
          path = require.resolve(req);
        } catch (error) {
          throw new Error(
            `unable to resolve bundle entrypoint: ${req}. Make sure that the "publicDirs" in the manifest of ${e.pkgId} are up-to-date.`
          );
        }

        return [`${req}$`, path];
      });
    })
  );

  const webpackConfig: webpack.Configuration = {
    mode: 'development',
    context: bundle.sourceRoot,
    cache: true,
    entry: ENTRY_CREATOR,

    devtool: worker.dist ? false : 'cheap-source-map',
    profile: worker.profileWebpack,

    output: {
      path: bundle.outputDir,
      filename: `${bundle.id}.js`,
      chunkLoading: 'jsonp',
      chunkLoadingGlobal: `jsonp_${bundle.id}`,
      chunkFilename: `${bundle.id}/chunk-[chunkhash].js`,
    },

    optimization: {
      emitOnErrors: true,
      chunkIds: 'deterministic',
    },

    plugins: [
      new CleanWebpackPlugin(),
      new PopulateBundleCachePlugin(worker, bundle, remoteMappings),
      ...(worker.profileWebpack ? [new EmitStatsPlugin(bundle)] : []),
      ...(bundle.banner ? [new webpack.BannerPlugin({ banner: bundle.banner, raw: true })] : []),
      new container.ModuleFederationPlugin({
        name: bundle.id,
        filename: 'remoteEntry.js',
        library: {
          type: 'global',
          name: bundle.id,
        },
        remotes: Object.fromEntries(
          Array.from(bundleRemotes.byPkgId.values())
            .filter((r) => r.bundleId !== bundle.id)
            .map((remote) => {
              const bundleId = JSON.stringify(remote.bundleId);
              const pkgId = JSON.stringify(remote.pkgId);
              return [
                remote.pkgId,
                `promise __kbnBundles__.getPkgFromBundle(${bundleId}, ${pkgId})`,
              ];
            })
        ),
        exposes: {
          './entry': ENTRY_CREATOR,
        },
        shared: Object.fromEntries(
          bundle.entries.flatMap((e) =>
            e.targets.map((target) => [
              target ? `${e.pkgId}/${target}` : e.pkgId,
              {
                eager: true,
                version: '0.0.0',
                requiredVersion: false,
              },
            ])
          )
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
              loader: require.resolve('val-loader'),
              options: {
                key: bundle.id,
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
                  require.resolve('./remote_babel_plugin'),
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
        {
          resourceQuery: '?raw',
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
      aliasFields: ['browser'],
      mainFields: ['browser', 'main'],
      alias: {
        core_app_image_assets: Path.resolve(
          worker.repoRoot,
          'src/core/public/styles/core_app/images'
        ),
        vega: Path.resolve(worker.repoRoot, 'node_modules/vega/build-es5/vega.js'),
        '@elastic/eui$': '@elastic/eui/optimize/es',
        moment$: MOMENT_SRC,
        'moment-timezone$': require.resolve('moment-timezone/moment-timezone'),
        // NOTE: Used to include react profiling on bundles
        // https://gist.github.com/bvaughn/25e6233aeb1b4f0cdb8d8366e54a3977#webpack-4
        'react-dom$': 'react-dom/profiling',
        'scheduler/tracing': 'scheduler/tracing-profiling',
        // ignored node built-ins
        child_process: false,
        zlib: false,
        path: false,
        crypto: false,
        os: false,
        stream: false,
        timers: false,
        fs: false,
        // resolve the bundle entry-points so that @kbn/ imports into plugins are not discovered by webpack. All the other plugins are
        // remotes, so they are already overwritten
        ...resolvedBundleEntryAliases,
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
