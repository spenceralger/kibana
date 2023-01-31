/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';

import { CachedInputFileSystem } from 'enhanced-resolve';
import webpack from 'webpack';
import { isNormalModule, isConcatenatedModule } from '@kbn/optimizer-webpack-helpers';

import { Bundle, WorkerConfig, ascending, parseFilePath, Hashes } from '../common';
import { BundleRemoteModule } from './bundle_remotes/bundle_remote_module';

/**
 * sass-loader creates about a 40% overhead on the overall optimizer runtime, and
 * so this constant is used to indicate to assignBundlesToWorkers() that there is
 * extra work done in a bundle that has a lot of scss imports. The value is
 * arbitrary and just intended to weigh the bundles so that they are distributed
 * across mulitple workers on machines with lots of cores.
 */
const EXTRA_SCSS_WORK_UNITS = 100;

import type { RemoteMappings } from './bundle_remotes';

export class PopulateBundleCachePlugin {
  constructor(
    private readonly workerConfig: WorkerConfig,
    private readonly bundle: Bundle,
    private readonly mappings: RemoteMappings
  ) {}

  public apply(compiler: webpack.Compiler) {
    const { bundle, workerConfig } = this;
    const inputFs = compiler.inputFileSystem;
    if (!(inputFs instanceof CachedInputFileSystem)) {
      throw new Error('expected inputFs to be a CachedInputFileSystem');
    }

    compiler.hooks.emit.tap('PopulateBundleCachePlugin', (compilation) => {
      let workUnits = compilation.fileDependencies.size;
      const bundleRefExportIds: string[] = [];

      const paths = new Set<string>();
      const rawHashes = new Map<string, string | null>();
      const addReferenced = (path: string) => {
        if (paths.has(path)) {
          return;
        }

        paths.add(path);
        let content: Buffer;
        try {
          const stringOrBuffer = inputFs.readFileSync(path);
          content =
            typeof stringOrBuffer === 'string' ? Buffer.from(stringOrBuffer) : stringOrBuffer;
        } catch {
          return rawHashes.set(path, null);
        }

        return rawHashes.set(path, Hashes.hash(content));
      };

      // add all files from the fileDependencies (which includes a bunch of directories) to the cache
      for (const path of compilation.fileDependencies) {
        const stat = inputFs.statSync(path);
        if (!stat.isFile()) {
          continue;
        }

        addReferenced(path);
        if (path.endsWith('.scss')) {
          workUnits += EXTRA_SCSS_WORK_UNITS;
          continue;
        }

        const parsedPath = parseFilePath(path);
        if (!parsedPath.dirs.includes('node_modules')) {
          continue;
        }

        const nmIndex = parsedPath.dirs.lastIndexOf('node_modules');
        const isScoped = parsedPath.dirs[nmIndex + 1].startsWith('@');
        const pkgJsonPath = Path.join(
          parsedPath.root,
          ...parsedPath.dirs.slice(0, nmIndex + 1 + (isScoped ? 2 : 1)),
          'package.json'
        );
        addReferenced(pkgJsonPath);
        continue;
      }

      let moduleCount = 0;
      for (const module of compilation.modules) {
        if (isNormalModule(module)) {
          moduleCount += 1;
          continue;
        }

        if (module instanceof BundleRemoteModule) {
          bundleRefExportIds.push(module.req);
          continue;
        }

        if (isConcatenatedModule(module)) {
          moduleCount += module.modules.length;
          continue;
        }
      }

      const referencedPaths = Array.from(paths).sort(ascending((p) => p));

      const chunk = compilation.namedChunks.get(bundle.id);
      if (!chunk) {
        throw new Error(`expected to find chunk named [${bundle.id}]`);
      }
      const syncZoneDeps = Array.from(this.mappings.getBundleRefsForChunk(chunk));

      bundle.cache.set({
        remoteBundleImportReqs: bundleRefExportIds.sort(ascending((p) => p)),
        optimizerCacheKey: workerConfig.optimizerCacheKey,
        cacheKey: bundle.createCacheKey(referencedPaths, new Hashes(rawHashes)),
        moduleCount,
        workUnits,
        referencedPaths,
        syncZoneDeps,
      });

      // write the cache to the compilation so that it isn't cleaned by clean-webpack-plugin
      bundle.cache.writeWebpackAsset(compilation);
    });
  }
}
