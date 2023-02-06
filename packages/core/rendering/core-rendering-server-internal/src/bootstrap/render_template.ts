/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { BundleZones } from '@kbn/optimizer-bundle-zones';
export interface BootstrapTemplateData {
  themeTag: string;
  publicPathMap: Record<string, string>;
  zoneBaseUrl: string;
  zones: BundleZones;
}

type Getter = () => unknown;
interface Container {
  init(): Promise<void>;
  get(id: './entry'): Promise<() => void>;
}

function boostrapFunction({ themeTag, publicPathMap, zoneBaseUrl, zones }: BootstrapTemplateData) {
  let fatalRendered = false;
  function fatal() {
    if (fatalRendered) {
      return;
    }

    fatalRendered = true;
    const err = document.createElement('h1');
    err.style.color = 'white';
    err.style.fontFamily = 'monospace';
    err.style.textAlign = 'center';
    err.style.background = '#F44336';
    err.style.padding = '25px';
    err.innerText =
      document.querySelector<HTMLElement>('[data-error-message]')?.dataset?.errorMessage ?? '';

    // eslint-disable-next-line no-unsanitized/property
    document.body.innerHTML = err.outerHTML;
  }

  function kbnBundlesLoader() {
    const scriptsTarget = document.querySelector('head meta[name="add-scripts-here"]');
    const getExport = new Map<string, Getter>();
    const loaded = new Map<string, Promise<void>>();
    const scope = Object.create(null);

    function has(prop: string) {
      return getExport.has(prop);
    }

    function define(key: string, req: (modId: string) => unknown, modId: string) {
      if (has(key)) {
        throw new Error('__kbnBundles__ already has a module defined for "' + key + '"');
      }
      getExport.set(key, () => req(modId));
    }

    function get(key: string) {
      const req = getExport.get(key);
      if (!req) {
        throw new Error('__kbnBundles__ does not have a module defined for "' + key + '"');
      }
      return req();
    }

    const depMap = new Map(Object.entries(zones.deps));
    function getDepsDeep(id: string, history: string[] = []): string[] {
      const deps = depMap.get(id);
      if (!deps) {
        return [];
      }

      return deps.flatMap((dep) => {
        if (history.includes(dep)) {
          throw new Error('circular dependency in zone deps');
        }

        return [dep, ...getDepsDeep(dep, [...history, id])];
      });
    }

    async function getPkgFromBundle(bundleId: string, pkgId: string) {
      await ensure([bundleId]);
      return get(pkgId);
    }

    async function ensure(bundleIds: string[]) {
      await Promise.all(
        bundleIds
          .flatMap((id) => [id, ...getDepsDeep(id)])
          .map((id) => {
            const existing = loaded.get(id);
            if (existing) {
              return existing;
            }

            const promise = new Promise<void>((resolve, reject) => {
              const dom = document.createElement('script');
              dom.async = false;
              dom.src = `${zoneBaseUrl}/${id}/remoteEntry.js`;
              dom.addEventListener('error', reject);
              dom.addEventListener('load', () => {
                const cont = window[id as any] as unknown as Container;
                if (!cont) {
                  reject(new Error(`expected bundle ${id} to write to window[${id}]`));
                } else {
                  Promise.resolve(cont.init(scope))
                    .then(async () => {
                      debugger;
                      const exec = await cont.get('./entry');
                      debugger;
                      return exec();
                    })
                    .then(
                      () => {
                        debugger;
                        console.log('bundle', id, 'is fully loaded');
                        resolve();
                      },
                      (err) => {
                        debugger;
                        console.error('bundle', id, 'failed to load', err);
                        reject(err);
                      }
                    );
                }
              });

              document.head.insertBefore(dom, scriptsTarget);
            });

            loaded.set(id, promise);
            return promise;
          })
      );
    }

    return { has, define, get, getPkgFromBundle, ensure };
  }

  const kbnCsp = JSON.parse(document.querySelector('kbn-csp')!.getAttribute('data')!);
  const global: any = window;
  global.__kbnStrictCsp__ = kbnCsp.strictCsp;
  global.__kbnThemeTag__ = themeTag;
  global.__kbnPublicPath__ = publicPathMap;
  global.__kbnBundles__ = kbnBundlesLoader();

  if (global.__kbnStrictCsp__ && global.__kbnCspNotEnforced__) {
    const legacyBrowserError = document.getElementById('kbn_legacy_browser_error');
    legacyBrowserError!.style.display = 'flex';
  } else {
    if (!global.__kbnCspNotEnforced__ && global.console) {
      global.console.log(
        '^ A single error about an inline script not firing due to content security policy is expected!'
      );
    }
    const loadingMessage = document.getElementById('kbn_loading_message');
    loadingMessage!.style.display = 'flex';

    global.onload = function () {
      performance.mark('kbnLoad', {
        detail: 'load_started',
      });

      global.__kbnBundles__.ensure(['@kbn/core']).then(() => {
        global.__kbnBundles__.get('@kbn/core/public').__kbnBootstrap__();
      });
    };
  }
}

export const renderTemplate = (data: BootstrapTemplateData) => {
  return `'use strict';
(${boostrapFunction.toString()}).call(null, ${JSON.stringify(data)});
`;
};
