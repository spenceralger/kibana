/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { inspect } from 'util';

import { isObj, isString } from './ts_helpers';
import { Bundle } from './bundle';
import { parseImportReq } from './import_req';

export interface BundleRemote {
  readonly bundleId: string;
  readonly pkgId: string;
  readonly targets: readonly string[];
}

function assertBundleRemotes(val: unknown): asserts val is BundleRemote[] {
  if (!Array.isArray(val)) {
    throw new Error('`bundleRemotes` spec must be an array');
  }

  for (const [i, remote] of val.entries()) {
    if (!isObj(remote)) {
      throw new Error(`'bundleRemotes[${i}]' must be an object: ${inspect(remote)}`);
    }

    if (typeof remote.bundleId !== 'string') {
      throw new Error(
        `'bundleRemotes[${i}]' must have a valid "bundleId" property: ${inspect(remote)}`
      );
    }

    if (typeof remote.pkgId !== 'string') {
      throw new Error(
        `'bundleRemotes[${i}]' must have a valid "pkgId" property: ${inspect(remote)}`
      );
    }

    if (
      !Array.isArray(remote.targets) ||
      !remote.targets.every(isString) ||
      remote.targets.length <= 0
    ) {
      throw new Error(
        `'bundleRemotes[${i}]' must have a valid "targets" property: ${inspect(remote)}`
      );
    }
  }
}

export class BundleRemotes {
  static fromBundles(bundles: Bundle[]) {
    return new BundleRemotes(
      bundles.flatMap((b) =>
        b.entries.map(
          (entry): BundleRemote => ({
            bundleId: b.id,
            pkgId: entry.pkgId,
            targets: entry.targets,
          })
        )
      )
    );
  }

  static parseSpec(json: unknown) {
    if (typeof json !== 'string') {
      throw new Error('expected `bundleRemotes` spec to be a JSON string');
    }

    let spec;
    try {
      spec = JSON.parse(json);
    } catch (error) {
      throw new Error('`bundleRemotes` spec must be valid JSON');
    }

    assertBundleRemotes(spec);

    return new BundleRemotes(spec);
  }

  public readonly byPkgId: Map<string, BundleRemote>;

  constructor(
    /**
     * Map of pkgIds to the bundle where that pkgId lives.
     */
    private readonly remotes: BundleRemote[]
  ) {
    this.byPkgId = new Map(remotes.map((r) => [r.pkgId, r]));
  }

  get(importReq: string) {
    const parsed = parseImportReq(importReq);
    if (!parsed.pkgId) {
      return {
        parsed,
        remote: undefined,
      };
    }

    const remote = this.byPkgId.get(parsed.pkgId);
    if (!remote?.targets.includes(parsed.target)) {
      return {
        parsed,
        remote: undefined,
      };
    }

    return {
      parsed,
      remote,
    };
  }

  /**
   * Determine the subset of `importReqs` which are valid import requests that resolve against our remotes
   */
  unionImportReqs(importReqs: string[]) {
    return importReqs.filter((req) => {
      const parsed = parseImportReq(req);
      if (!parsed.pkgId) {
        return false;
      }

      const own = this.byPkgId.get(parsed.pkgId);
      if (!own) {
        return false;
      }

      return !parsed.target || !!own.targets?.includes(parsed.target);
    });
  }

  public toSpecJson() {
    return JSON.stringify(this.remotes);
  }
}
