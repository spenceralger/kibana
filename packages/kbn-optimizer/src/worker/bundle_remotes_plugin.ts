/* eslint-disable @kbn/eslint/require-license-header */

/**
 * @notice
 *
 * This module was heavily inspired by the externals plugin that ships with webpack@97d58d31
 * MIT License http://www.opensource.org/licenses/mit-license.php
 * Author Tobias Koppers @sokra
 */

import webpack from 'webpack';
import { ConcatSource } from 'webpack-sources';
import { getDependecies } from '@kbn/optimizer-webpack-helpers';

import { Bundle, BundleRemotes } from '../common';
import { BundleRemoteModule } from './bundle_remote_module';

const PLUGIN_NAME = 'BundleRemotesPlugin';

interface RequestData {
  context: string;
  dependencies: Array<{ request: string }>;
}

type Callback<T> = (error?: any, result?: T) => void;
type ModuleFactory = (data: RequestData, callback: Callback<BundleRemoteModule>) => void;

export class BundleRemotesPlugin {
  constructor(private readonly bundle: Bundle, private readonly remotes: BundleRemotes) {}

  /**
   * Called by webpack when the plugin is passed in the webpack config
   */
  public apply(compiler: webpack.Compiler) {
    // called whenever the compiler starts to compile, passed the params
    // that will be used to create the compilation
    compiler.hooks.compile.tap(PLUGIN_NAME, (compilationParams: any) => {
      const moduleCache = new Map<string, BundleRemoteModule | null>();

      // hook into the creation of NormalModule instances in webpack, if the import
      // statement leading to the creation of the module is pointing to a bundleRef
      // entry then create a BundleRefModule instead of a NormalModule.
      compilationParams.normalModuleFactory.hooks.factory.tap(
        'BundleRefsPlugin/normalModuleFactory/factory',
        (wrappedFactory: ModuleFactory): ModuleFactory =>
          (data, callback) => {
            const { request } = data.dependencies[0];

            const cached = moduleCache.get(request);
            if (cached === null) {
              return wrappedFactory(data, callback);
            }
            if (cached !== undefined) {
              return callback(null, cached);
            }

            this.resolve(request, (error, result) => {
              if (error || result === undefined) {
                return callback(error);
              }

              moduleCache.set(request, result);

              if (result === null) {
                return wrappedFactory(data, callback);
              }

              callback(null, result);
            });
          }
      );
    });

    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.chunkAsset.tap(PLUGIN_NAME, (chunk, filename) => {
        if (chunk.canBeInitial()) {
          // we don't wrap entry chunks in amd wrappers, just async chunks
          return;
        }

        const remotes = Array.from(
          new Set(
            Array.from(chunk.modulesIterable, (m) => {
              return getDependecies(m).flatMap((dep) => {
                if (dep.module instanceof BundleRemoteModule) {
                  return dep.module.remote.bundleId;
                }

                return [];
              });
            }).flat()
          )
        );

        if (!remotes.length) {
          return;
        }

        compilation.updateAsset(filename, (source) => {
          return new ConcatSource(
            `__kbn.ensure(${JSON.stringify(remotes)}).then(() => {\n`,
            source,
            '\n});'
          );
        });
      });
    });
  }

  public resolve(req: string, cb: (error?: Error, bundle?: null | BundleRemoteModule) => void) {
    if (req.endsWith('.json')) {
      return cb(undefined, null);
    }

    const { parsed, remote } = this.remotes.get(req);
    if (!remote || remote.bundleId === this.bundle.id) {
      return cb(undefined, null);
    }

    return cb(undefined, new BundleRemoteModule(remote, parsed));
  }
}
