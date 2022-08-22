/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

const Path = require('path');

const globby = require('globby');
const normalizePath = require('normalize-path');
const { REPO_ROOT } = require('@kbn/utils');
const { asyncMapWithLimit } = require('@kbn/std');

const { BazelPackage } = require('./bazel_package');
const { BAZEL_PACKAGE_DIRS } = require('./bazel_package_dirs');

/**
 *
 * @param {string} repoRoot
 * @returns
 */
function discoverBazelPackageLocations(repoRoot) {
  const packagesWithPackageJson = globby
    .sync(
      BAZEL_PACKAGE_DIRS.map((dir) => `${dir}/*/package.json`),
      {
        cwd: repoRoot,
        absolute: true,
      }
    )
    // NOTE: removing x-pack by default for now to prevent a situation where a BUILD.bazel file
    // needs to be added at the root of the folder which will make x-pack to be wrongly recognized
    // as a Bazel package in that case
    .filter((path) => !normalizePath(path).includes('x-pack/package.json'))
    .sort((a, b) => a.localeCompare(b))
    .map((path) => Path.dirname(path));

  const packagesWithBuildBazel = globby
    .sync(
      BAZEL_PACKAGE_DIRS.map((dir) => `${dir}/*/BUILD.bazel`),
      {
        cwd: repoRoot,
        absolute: true,
      }
    )
    .map((path) => Path.dirname(path));

  // NOTE: only return as discovered packages the ones with a package.json + BUILD.bazel file.
  // In the future we should change this to only discover the ones declaring kibana.json.
  return packagesWithPackageJson.filter((pkg) => packagesWithBuildBazel.includes(pkg));
}

/**
 *
 * @param {string | undefined} repoRoot
 * @returns
 */
async function discoverBazelPackages(repoRoot = REPO_ROOT) {
  return await asyncMapWithLimit(
    discoverBazelPackageLocations(repoRoot),
    100,
    async (dir) => await BazelPackage.fromDir(dir)
  );
}

module.exports = { discoverBazelPackageLocations, discoverBazelPackages };
