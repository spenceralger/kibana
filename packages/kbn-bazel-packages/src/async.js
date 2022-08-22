/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

/**
 * @template T
 * @returns {{ resolve: (v: T) => void, reject: (err: Error) => void, promise: Promise<T> }}
 */
function makeDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((_, __) => {
    resolve = _;
    reject = __;
  });
  return {
    promise,
    resolve: /** @type {(v: T) => void} */ (/** @type {unknown} */ (resolve)),
    reject: /** @type {(v: Error) => void} */ (/** @type {unknown} */ (reject)),
  };
}

/**
 * @template T
 * @template T2
 * @param {Array<T>} source
 * @param {number} limit
 * @param {(v: T) => Promise<T2>} mapFn
 * @returns {Promise<T2[]>}
 */
function asyncMapWithLimit(source, limit, mapFn) {
  if (source.length === 0) {
    return Promise.resolve([]);
  }

  let inProgress = 0;
  const queue = [...source.entries()];
  const defer = makeDeferred();

  /** @type {T2[]} */
  const results = new Array(source.length);

  /**
   * @param {number} index
   * @param {T} item
   */
  function run(index, item) {
    inProgress += 1;
    Promise.resolve()
      .then(() => mapFn(item))
      .then(
        (result) => {
          results[index] = result;
          inProgress -= 1;

          if (queue.length) {
            runMore();
          } else if (inProgress === 0) {
            // complete!
            defer.resolve(results);
          }
        },
        (error) => {
          limit = 0;
          defer.reject(error);
        }
      );
  }

  function runMore() {
    while (inProgress < limit) {
      const entry = queue.shift();
      if (!entry) {
        break;
      }

      run(...entry);
    }
  }

  setImmediate(runMore);

  return defer.promise;
}

module.exports = { asyncMapWithLimit };
