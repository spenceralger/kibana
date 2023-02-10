/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Fs from 'fs';
import Path from 'path';

import * as Rx from 'rxjs';
import { mergeMap, share, observeOn } from 'rxjs/operators';

import { summarizeEventStream, Update } from './common';

import {
  OptimizerConfig,
  OptimizerEvent,
  OptimizerState,
  getBundleCacheEvent$,
  getOptimizerCacheKey,
  watchBundlesForChanges$,
  runWorkers,
  OptimizerInitializedEvent,
  createOptimizerStateSummarizer,
  handleOptimizerCompletion,
} from './optimizer';

export type OptimizerUpdate = Update<OptimizerEvent, OptimizerState>;
export type OptimizerUpdate$ = Rx.Observable<OptimizerUpdate>;

export function runOptimizer(config: OptimizerConfig) {
  const bundleInfoPath = Path.resolve(config.repoRoot, 'target/bundles/info.json');
  const pkgStatsPath = Path.resolve(config.repoRoot, 'target/bundles/pkg_stats.json');
  const bundlePkgs = Object.fromEntries(
    config.bundles.map((b) => [b.id, b.entries.map((e) => e.pkgId)])
  );

  return Rx.defer(async () => {
    if (process.platform === 'darwin') {
      try {
        require.resolve('fsevents');
      } catch (error) {
        if (error.code === 'MODULE_NOT_FOUND') {
          throw new Error(
            '`fsevents` module is not installed, most likely because you need to follow the instructions at https://github.com/nodejs/node-gyp/blob/master/macOS_Catalina.md and re-bootstrap Kibana'
          );
        }

        throw error;
      }
    }

    return {
      startTime: Date.now(),
      cacheKey: await getOptimizerCacheKey(config),
    };
  }).pipe(
    mergeMap(({ startTime, cacheKey }) => {
      const bundleCacheEvent$ = getBundleCacheEvent$(config, cacheKey).pipe(
        observeOn(Rx.asyncScheduler),
        share()
      );

      // initialization completes once all bundle caches have been resolved
      const init$ = Rx.concat(
        bundleCacheEvent$,
        Rx.of<OptimizerInitializedEvent>({
          type: 'optimizer initialized',
        })
      );

      // watch the offline bundles for changes, turning them online...
      const changeEvent$ = config.watch
        ? watchBundlesForChanges$(bundleCacheEvent$, startTime).pipe(share())
        : Rx.EMPTY;

      // run workers to build all the online bundles, including the bundles turned online by changeEvent$
      const workerEvent$ = runWorkers(config, cacheKey, bundleCacheEvent$, changeEvent$);

      // create the stream that summarized all the events into specific states
      return summarizeEventStream<OptimizerEvent, OptimizerState>(
        Rx.merge(init$, changeEvent$, workerEvent$),
        {
          phase: 'initializing',
          compilerStates: [],
          offlineBundles: [],
          onlineBundles: [],
          startTime,
          durSec: 0,
          bundleDeps: {},
        },
        createOptimizerStateSummarizer(config)
      ).pipe(
        // write bundle deps to disk when bundleDeps on state update
        Rx.scan((prev, update) => {
          if (prev.state.bundleDeps !== update.state.bundleDeps) {
            Fs.writeFileSync(
              bundleInfoPath,
              JSON.stringify({ deps: update.state.bundleDeps, pkgs: bundlePkgs }, null, 2)
            );
          }

          if (prev.state.pkgStatsById !== update.state.pkgStatsById) {
            Fs.writeFileSync(
              pkgStatsPath,
              JSON.stringify(
                {
                  pkgStatsById: update.state.pkgStatsById
                    ? Array.from(update.state.pkgStatsById)
                    : [],
                },
                null,
                2
              )
            );
          }

          return update;
        })
      );
    }),
    handleOptimizerCompletion(config)
  );
}
