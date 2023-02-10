/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';
import { inspect } from 'util';

import { findPackageForPath } from '@kbn/repo-packages';
import webpack from 'webpack';
import { SetMap } from '@kbn/set-map';
import {
  isExternalModule,
  isNormalModule,
  isIgnoredModule,
  isConcatenatedModule,
  isDelegatedModule,
  getModulePath,
  getModuleSize,
  getDependecies,
} from '@kbn/optimizer-webpack-helpers';

import {
  Bundle,
  WorkerConfig,
  ascending,
  parseFilePath,
  Hashes,
  ParsedDllManifest,
  PkgStat,
} from '../common';
import { BundleRemoteModule } from './bundle_remote_module';

class ModuleMap extends SetMap<string, webpack.Module> {
  #pkgIdByModule = new Map<webpack.Module, string>();
  add(pkgId: string, value: webpack.Module) {
    this.#pkgIdByModule.set(value, pkgId);
    return super.add(pkgId, value);
  }
  getPkgId(module: webpack.Module) {
    return this.#pkgIdByModule.get(module);
  }
}

/**
 * sass-loader creates about a 40% overhead on the overall optimizer runtime, and
 * so this constant is used to indicate to assignBundlesToWorkers() that there is
 * extra work done in a bundle that has a lot of scss imports. The value is
 * arbitrary and just intended to weigh the bundles so that they are distributed
 * across mulitple workers on machines with lots of cores.
 */
const EXTRA_SCSS_WORK_UNITS = 100;

export class PopulateBundleCachePlugin {
  constructor(
    private readonly workerConfig: WorkerConfig,
    private readonly bundle: Bundle,
    private readonly dllManifest: ParsedDllManifest
  ) {}

  public apply(compiler: webpack.Compiler) {
    const { bundle, workerConfig } = this;

    compiler.hooks.emit.tap(
      {
        name: 'PopulateBundleCachePlugin',
        before: ['BundleMetricsPlugin'],
      },
      (compilation) => {
        const bundleRefExportIds = new Set<string>();
        const remoteBundleDeps = new Set<string>();
        let moduleCount = 0;
        let workUnits = compilation.fileDependencies.size;

        const modulesByPkgId = workerConfig.dist ? new ModuleMap() : undefined;
        const paths = new Set<string>();
        const rawHashes = new Map<string, string | null>();
        const dllRefKeys = new Set<string>();

        function addReferenced(path: string) {
          if (paths.has(path)) {
            return;
          }

          paths.add(path);
          let content: Buffer;
          try {
            content = compiler.inputFileSystem.readFileSync(path);
          } catch {
            return rawHashes.set(path, null);
          }

          return rawHashes.set(path, Hashes.hash(content));
        }

        function trackModuleFromBuild(module: webpack.Module, isInEntryChunk: boolean) {
          if (isNormalModule(module)) {
            moduleCount += 1;
            const path = getModulePath(module);
            const parsedPath = parseFilePath(path);

            if (!parsedPath.dirs.includes('node_modules')) {
              addReferenced(path);

              if (path.endsWith('.scss')) {
                workUnits += EXTRA_SCSS_WORK_UNITS;

                for (const depPath of module.buildInfo.fileDependencies) {
                  addReferenced(depPath);
                }
              }

              if (isInEntryChunk && modulesByPkgId) {
                const pkg = findPackageForPath(workerConfig.repoRoot, path);
                if (pkg) {
                  modulesByPkgId.add(pkg.id, module);
                }
              }
              return;
            }

            const nmIndex = parsedPath.dirs.lastIndexOf('node_modules');
            const isScoped = parsedPath.dirs[nmIndex + 1].startsWith('@');
            const pkgJsonPath = Path.join(
              parsedPath.root,
              ...parsedPath.dirs.slice(0, nmIndex + 1 + (isScoped ? 2 : 1)),
              'package.json'
            );
            addReferenced(pkgJsonPath);
            if (modulesByPkgId) {
              if (isInEntryChunk) {
                modulesByPkgId.add(
                  parsedPath.dirs.slice(nmIndex + 1, nmIndex + 1 + (isScoped ? 2 : 1)).join('/'),
                  module
                );
              }
            }

            return;
          }

          if (module instanceof BundleRemoteModule) {
            bundleRefExportIds.add(module.req.full);
            remoteBundleDeps.add(module.remote.bundleId);
            return;
          }

          if (isConcatenatedModule(module)) {
            for (const m of module.modules) {
              trackModuleFromBuild(m, isInEntryChunk);
            }
            return;
          }

          if (isDelegatedModule(module)) {
            // delegated modules are the references to the ui-shared-deps-npm dll
            dllRefKeys.add(module.userRequest);
            return;
          }

          if (isExternalModule(module) || isIgnoredModule(module)) {
            return;
          }

          throw new Error(`Unexpected module type: ${inspect(module)}`);
        }

        for (const p of bundle.manifestPaths) {
          addReferenced(p);
        }

        for (const chunk of compilation.chunks as webpack.Chunk[]) {
          const isInEntryChunk = chunk.canBeInitial();
          for (const module of chunk.modulesIterable) {
            trackModuleFromBuild(module as unknown as webpack.Module, isInEntryChunk);
          }
        }

        const referencedPaths = Array.from(paths).sort(ascending((p) => p));
        const sortedDllRefKeys = Array.from(dllRefKeys).sort(ascending((p) => p));

        const pkgStats: PkgStat[] | undefined = modulesByPkgId ? [] : undefined;
        if (modulesByPkgId && pkgStats) {
          for (const [pkgId, moduleSet] of modulesByPkgId) {
            const modules = Array.from(moduleSet);
            const size = modules.reduce((a, m) => a + getModuleSize(m), 0);
            pkgStats.push({
              id: pkgId,
              size,
              deps:
                pkgId === '@kbn/optimizer'
                  ? []
                  : Array.from(
                      new Set(
                        modules.flatMap((m) =>
                          getDependecies(m).flatMap((dep) => {
                            if (
                              !dep.module ||
                              isDelegatedModule(dep.module) ||
                              dep.module instanceof BundleRemoteModule
                            ) {
                              return [];
                            }

                            const depId = modulesByPkgId.getPkgId(dep.module);
                            if (depId === pkgId) {
                              return [];
                            }

                            if (!depId) {
                              return [];
                            }

                            return depId;
                          })
                        )
                      )
                    ),
            });
          }
        }

        bundle.cache.set({
          remoteBundleImportReqs: Array.from(bundleRefExportIds).sort(ascending((p) => p)),
          optimizerCacheKey: workerConfig.optimizerCacheKey,
          cacheKey: bundle.createCacheKey(
            referencedPaths,
            new Hashes(rawHashes),
            this.dllManifest,
            sortedDllRefKeys
          ),
          moduleCount,
          workUnits,
          referencedPaths,
          dllRefKeys: sortedDllRefKeys,
          remoteBundleDeps: Array.from(remoteBundleDeps),
          pkgStats,
        });

        // write the cache to the compilation so that it isn't cleaned by clean-webpack-plugin
        bundle.cache.writeWebpackAsset(compilation);
      }
    );
  }
}
