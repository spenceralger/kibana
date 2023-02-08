/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import Path from 'path';
import { inspect } from 'util';

import { BundleCache } from './bundle_cache';
import { UnknownVals } from './ts_helpers';
import { isObj, isString } from './ts_helpers';
import { ParsedDllManifest } from './dll_manifest';
import type { Hashes } from './hashes';

export interface BundleEntry {
  pkgId: string;
  targets: string[];
  pluginId?: string;
}

function isBundleEntry(val: unknown): val is BundleEntry {
  return (
    isObj(val) &&
    typeof val.pkgId === 'string' &&
    (typeof val.pluginId === 'string' || val.pluginId === undefined) &&
    Array.isArray(val.targets) &&
    val.targets.length >= 1 &&
    val.targets.every(isString)
  );
}

export interface BundleSpec {
  /** Unique id for this bundle */
  readonly id: string;
  /** Absolute path to the root of the repository */
  readonly sourceRoot: string;
  /** Absolute path to the directory where output should be written */
  readonly outputDir: string;
  /** Banner that should be written to all bundle JS files */
  readonly banner?: string;
  /** Path to the manifest files of the entries in this bundle */
  readonly manifestPaths: string[];
  /**
   * Array of entry strings which will be imported at the root of the
   * bundle. All imports for these modules in other bundles will load
   * and reference this bundle.
   */
  readonly entries: Array<{ pkgId: string; targets?: string[]; pluginId?: string } | string>;
}

export class Bundle {
  /** Unique identifier for this bundle */
  public readonly id: BundleSpec['id'];
  /** Absolute path to the root of the whole project source, repo root */
  public readonly sourceRoot: BundleSpec['sourceRoot'];
  /** Absolute path to the output directory for this bundle */
  public readonly outputDir: BundleSpec['outputDir'];
  /** Banner that should be written to all bundle JS files */
  public readonly banner: BundleSpec['banner'];
  /** Banner that should be written to all bundle JS files */
  public readonly manifestPaths: BundleSpec['manifestPaths'];
  /**
   * Array of entry strings which will be imported at the root of the
   * bundle. All imports for these modules in other bundles will load
   * and reference this bundle.
   */
  public readonly entries: BundleEntry[];

  public readonly cache: BundleCache;

  constructor(spec: BundleSpec) {
    this.id = spec.id;
    this.sourceRoot = spec.sourceRoot;
    this.outputDir = spec.outputDir;
    this.banner = spec.banner;
    this.entries = spec.entries
      .map((e) => (typeof e === 'string' ? { pkgId: e } : e))
      .map((e) => ({
        pkgId: e.pkgId,
        targets: e.targets ?? [''],
        pluginId: e.pluginId,
      }));
    this.cache = new BundleCache(this.outputDir);
    this.manifestPaths = spec.manifestPaths;
  }

  /**
   * Calculate the cache key for this bundle based from current
   * state determined by looking at files on disk.
   */
  createCacheKey(
    paths: string[],
    hashes: Hashes,
    dllManifest: ParsedDllManifest,
    dllRefKeys: string[]
  ): unknown {
    return {
      spec: this.toSpec(),
      checksums: Object.fromEntries(paths.map((p) => [p, hashes.getCached(p)] as const)),
      dllName: dllManifest.name,
      dllRefs: Object.fromEntries(dllRefKeys.map((k) => [k, dllManifest.content[k]] as const)),
    };
  }

  /**
   * Get the raw "specification" for the bundle, this object is JSON serialized
   * in the cache key, passed to worker processes so they know what bundles
   * to build, and passed to the Bundle constructor to rebuild the Bundle object.
   */
  toSpec(): BundleSpec {
    return {
      id: this.id,
      sourceRoot: this.sourceRoot,
      outputDir: this.outputDir,
      banner: this.banner,
      entries: this.entries,
      manifestPaths: this.manifestPaths,
    };
  }
}

/**
 * Parse a JSON string containing an array of BundleSpec objects into an array
 * of Bundle objects, validating everything.
 */
export function parseBundles(json: string) {
  try {
    if (typeof json !== 'string') {
      throw new Error('must be a JSON string');
    }

    const specs: Array<UnknownVals<BundleSpec>> = JSON.parse(json);

    if (!Array.isArray(specs)) {
      throw new Error('must be an array');
    }

    return specs.map((spec: UnknownVals<BundleSpec>): Bundle => {
      if (!(spec && typeof spec === 'object')) {
        throw new Error('`bundles[]` must be an object');
      }

      const { id, sourceRoot, outputDir, banner, entries, manifestPaths, ...extra } = spec;
      if (Object.keys(extra).length) {
        throw new Error(`extra keys in bundle object: ${Object.keys(extra).join(', ')}`);
      }

      if (!(typeof id === 'string')) {
        throw new Error('`bundles[]` must have a string `id` property');
      }

      if (!(typeof sourceRoot === 'string' && Path.isAbsolute(sourceRoot))) {
        throw new Error('`bundles[]` must have an absolute path `sourceRoot` property');
      }

      if (!(typeof outputDir === 'string' && Path.isAbsolute(outputDir))) {
        throw new Error('`bundles[]` must have an absolute path `outputDir` property');
      }

      if (banner !== undefined) {
        if (!(typeof banner === 'string')) {
          throw new Error('`bundles[]` must have a string `banner` property');
        }
      }

      if (!Array.isArray(entries) || !entries.every(isBundleEntry)) {
        throw new Error('`bundles[]` must have a `entries` valid property: ' + inspect(entries));
      }

      if (!Array.isArray(manifestPaths) || !manifestPaths.every(isString)) {
        throw new Error('`bundles[]` must have a `manifestPaths` valid property');
      }

      return new Bundle({
        id,
        sourceRoot,
        outputDir,
        banner,
        entries,
        manifestPaths,
      });
    });
  } catch (error) {
    throw new Error(`unable to parse bundles: ${error.message}`);
  }
}
