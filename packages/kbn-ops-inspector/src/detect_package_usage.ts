/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import Path from 'path';
import Fs from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream';

import readPkg from 'read-pkg';
import writePkg from 'write-pkg';
import * as Babel from '@babel/core';
import * as T from '@babel/types';
import traverse from '@babel/traverse';
import vfs from 'vinyl-fs';
import { transformFileStream, REPO_ROOT, RunContext } from '@kbn/dev-utils';

const asyncPipeline = promisify(pipeline);

export async function detectPackageUsage({ log }: RunContext) {
  class Pkg {
    public readonly reqPaths = new Map<string, string[]>();
    public readonly parent = getPackageJson(Path.dirname(Path.dirname(this.path)));
    public readonly children: Pkg[] = [];

    constructor(
      public readonly path: string,
      public readonly json: ReturnType<typeof readPkg['sync']>
    ) {
      if (this.parent) {
        this.parent.children.push(this);
      }
    }

    hasDep(dep: string) {
      return (
        this.json.dependencies?.hasOwnProperty(dep) ||
        this.json.devDependencies?.hasOwnProperty(dep)
      );
    }

    addReq(req: string, path: string): void {
      if (!this.hasDep(req) && this.parent) {
        return this.parent.addReq(req, path);
      }

      let paths = this.reqPaths.get(req);
      if (!paths) {
        paths = [];
        this.reqPaths.set(req, paths);
      }

      paths.push(path);
    }

    *iterProdDeps() {
      for (const [req] of Object.entries(this.json.dependencies || {})) {
        yield req;
      }
    }

    onlyReqByPublic(req: string) {
      const paths = this.reqPaths.get(req);
      if (paths && paths.every((p) => p.includes('/public/'))) {
        return true;
      }

      return false;
    }

    makeDevDep(dep: string) {
      if (!this.json.devDependencies) {
        this.json.devDependencies = {};
      }

      if (!this.json.dependencies) {
        this.json.dependencies = {};
      }

      this.json.devDependencies[dep] = this.json.dependencies[dep];
      delete this.json.dependencies[dep];
    }
  }

  const packageByPaths = new Map<string, Pkg | null>();
  function getPackageJson(dir: string): Pkg | null {
    let pkgJson = packageByPaths.get(dir);

    if (pkgJson === undefined) {
      const pkgJsonPath = Path.join(dir, 'package.json');

      if (Fs.existsSync(pkgJsonPath)) {
        pkgJson = new Pkg(pkgJsonPath, readPkg.sync({ cwd: dir, normalize: false }));
      } else {
        const parent = Path.dirname(dir);
        if (parent === dir) {
          pkgJson = null;
        } else {
          pkgJson = getPackageJson(parent);
        }
      }

      packageByPaths.set(dir, pkgJson);
    }

    return pkgJson;
  }

  await asyncPipeline(
    vfs.src(
      [
        '**/*.{js,ts,tsx,jsx}',
        '!**/node_modules/**',
        '!**/dist/**',
        '!**/target/**',
        '!build/**',
        '!x-pack/build/**',
        '!packages/kbn-ui-framework/generator-kui/**',
      ],
      {
        cwd: REPO_ROOT,
        buffer: true,
      }
    ),

    transformFileStream(async (file) => {
      log.verbose(file.relative);

      const source = file.contents.toString('utf8');
      const ast = await Babel.parseAsync(source, {
        filename: file.path,
        filenameRelative: file.relative,
        parserOpts: {
          allowAwaitOutsideFunction: true,
          allowImportExportEverywhere: true,
          allowReturnOutsideFunction: true,
          allowSuperOutsideMethod: true,
          allowUndeclaredExports: true,
        },
        presets: [require.resolve('@kbn/babel-preset/node_preset')],
      });

      if (!T.isFile(ast)) {
        throw new Error('expected file to parse to file...');
      }

      const addReq = (req: string | undefined) => {
        if (req === undefined) {
          return;
        }

        if (req.includes('!')) {
          req = req.split('!').pop()!;
        }

        if (req.includes('/')) {
          const parts = req.split('/');
          req = parts.slice(0, req.startsWith('@') ? 2 : 1).join('/');
        }

        if (!req.startsWith('.') && !req.startsWith('src/')) {
          const pkg = getPackageJson(file.dirname);
          if (!pkg) {
            log.error(`Unable to find package for [${file.path}]`);
          } else {
            pkg.addReq(req, file.path);
          }
        }
      };

      traverse(ast, {
        ImportDeclaration(path) {
          addReq(path.node.source.value);
        },
        CallExpression(path) {
          if (
            T.isIdentifier(path.node.callee) &&
            path.node.callee.name === 'require' &&
            path.node.arguments.length === 1 &&
            T.isStringLiteral(path.node.arguments[0])
          ) {
            addReq(path.node.arguments[0].value);
          }
        },
      });

      return null;
    })
  );

  function movePublicDepsToDevDeps(pkg: Pkg) {
    const couldBeDevDeps = new Set<string>();

    for (const req of pkg.iterProdDeps()) {
      if (req.startsWith('@types') || pkg.onlyReqByPublic(req)) {
        couldBeDevDeps.add(req);
      }
    }

    if (couldBeDevDeps.size) {
      for (const dep of couldBeDevDeps) {
        pkg.makeDevDep(dep);
      }

      writePkg.sync(pkg.path, pkg.json as any);
    }

    for (const child of pkg.children) {
      movePublicDepsToDevDeps(child);
    }
  }

  const rootPkg = getPackageJson(REPO_ROOT)!;
  movePublicDepsToDevDeps(rootPkg);
}
