/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Fs from 'fs';
import Fsp from 'fs/promises';
import Path from 'path';

import { getTsConfig } from '../config_generation/generate_tsconfig.mjs';

/**
 * @param {any} aPath
 * @param {any} bPath
 */
function normalizePath(aPath, bPath) {
  if (`./${bPath}` === aPath) {
    return aPath;
  }

  return bPath;
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isObj(v) {
  return typeof v === 'object' && v !== null;
}

/**
 * @param {unknown} obj
 * @returns {Map<string, unknown>}
 */
function toMap(obj) {
  return isObj(obj)
    ? new Map(Object.entries(obj).map(([k, v]) => [k, v == null ? null : v]))
    : new Map();
}

/**
 * @param {unknown} a
 * @param {unknown} b
 */
function typesEql(a, b) {
  const aTypes = Array.isArray(a) ? a : [];
  const bTypes = Array.isArray(b) ? b : [];

  if (bTypes.length <= aTypes.length && bTypes.every((x) => aTypes.includes(x))) {
    return true;
  }

  return false;
}

/**
 * @param {Map<string, unknown>} aEnt
 * @param {Map<string, unknown>} bEnt
 */
function diff(aEnt, bEnt) {
  const bChanges = new Map();
  for (const key of bEnt.keys()) {
    const a = aEnt.get(key);
    const b = bEnt.get(key);

    if (a !== b) {
      bChanges.set(key, b);
    }
  }

  return bChanges;
}

/** @type {import('../lib/command').Command} */
export const command = {
  name: '_x',
  async run({ log }) {
    const { REPO_ROOT } = await import('@kbn/utils');
    const { discoverBazelPackages, Jsonc } = await import('@kbn/bazel-packages');

    for (const pkg of await discoverBazelPackages(REPO_ROOT)) {
      const tsconfigPath = Path.resolve(REPO_ROOT, pkg.normalizedRepoRelativeDir, 'tsconfig.json');
      if (!Fs.existsSync(tsconfigPath)) {
        log.warning(pkg.manifest.id, 'has no tsconfig.json file');
        continue;
      }

      const generatedCompilerOptions = toMap(
        getTsConfig(pkg.manifest, pkg.normalizedRepoRelativeDir).compilerOptions
      );
      const actualCompilerOptions = toMap(
        /** @type {any} */ (Jsonc.parse(await Fsp.readFile(tsconfigPath, 'utf8')))
          .compilerOptions ?? {}
      );

      if (typesEql(generatedCompilerOptions.get('types'), actualCompilerOptions.get('types'))) {
        actualCompilerOptions.set('types', generatedCompilerOptions.get('types'));
      }

      actualCompilerOptions.set(
        'outDir',
        normalizePath(actualCompilerOptions.get('outDir'), generatedCompilerOptions.get('outDir'))
      );

      const changes = diff(generatedCompilerOptions, actualCompilerOptions);

      await Fsp.unlink(tsconfigPath);
      if (!changes.size) {
        continue;
      }

      if (pkg.manifest.id === '@kbn/tinymath') {
        debugger;
      }

      const jsoncPath = Path.resolve(REPO_ROOT, pkg.normalizedRepoRelativeDir, 'kibana.jsonc');
      const kibanaJsonc = /** @type {Record<any, any>} */ (
        /** @type {unknown} */ (Jsonc.parse(await Fsp.readFile(jsoncPath, 'utf8')))
      );

      await Fsp.writeFile(
        jsoncPath,
        JSON.stringify(
          {
            ...kibanaJsonc,
            __deprecated__TalkToOperationsIfYouThinkYouNeedThis: {
              ...kibanaJsonc.__deprecated__TalkToOperationsIfYouThinkYouNeedThis,
              tsCompilerOptions: Object.fromEntries(changes),
            },
          },
          null,
          2
        )
          .replaceAll(/([}\]"])$/gm, '$1,')
          .slice(0, -1) + '\n'
      );

      log.success('updated', pkg.manifest.id);
    }
  },
};
