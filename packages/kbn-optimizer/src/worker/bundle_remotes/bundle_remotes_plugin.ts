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

import { Bundle, BundleRemotes } from '../../common';
import { BundleRemoteModule } from './bundle_remote_module';
import { RemoteMappings } from './remote_mappings';

interface RequestData {
  context: string;
  dependencies: Array<{ request: string }>;
}

type Callback<T> = (error?: any, result?: T) => void;
type ModuleFactory = (data: RequestData, callback: Callback<BundleRemoteModule>) => void;

export class BundleRemotesPlugin {
  constructor(
    private readonly bundle: Bundle,
    private readonly remotes: BundleRemotes,
    private readonly remoteMapping: RemoteMappings
  ) {}

  /**
   * Called by webpack when the plugin is passed in the webpack config
   */
  public apply(compiler: webpack.Compiler) {
    // called whenever the compiler starts to compile, passed the params
    // that will be used to create the compilation
    compiler.hooks.compile.tap('BundleRemotesPlugin/moduleResolve', (compilationParams: any) => {
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

    compiler.hooks.compilation.tap('BundleRemotesPlugin/beforeOptimize', (compilation) => {
      compilation.hooks.optimizeChunkAssets.tapPromise(
        'BundleRemotesPlugin/wrapChunks',
        async (chunks) => {
          for (const chunk of chunks) {
            const referencedBundles = this.remoteMapping.getBundleRefsForChunk(chunk);
            referencedBundles.delete(this.bundle.id);

            if (referencedBundles.size) {
              const deps = JSON.stringify(
                Array.from(referencedBundles).sort((a, b) => a.localeCompare(b))
              );

              for (const file of chunk.files) {
                compilation.assets[file] = new ConcatSource(
                  `__kbnBundles__.ensure(${deps}, function () {\n`,
                  compilation.assets[file],
                  `\n});`
                );
              }
            }
          }
        }
      );
    });
  }

  public resolve(request: string, cb: (error?: Error, bundle?: null | BundleRemoteModule) => void) {
    const { parsed, remote } = this.remotes.get(request);
    if (!remote || remote.bundleId === this.bundle.id) {
      return cb(undefined, null);
    }

    if (!remote.targets.includes(parsed.target)) {
      if (!remote.pkgId.startsWith('@kbn/')) {
        return cb(undefined, null);
      }

      const list = remote.targets.join(', ');
      return cb(
        new Error(
          `import [${request}] references a module which is shared from the ${remote.bundleId} bundle. Invalid target "${parsed.target}", only supported targets are ${list}`
        )
      );
    }

    return cb(undefined, new BundleRemoteModule(remote, request));
  }
}
