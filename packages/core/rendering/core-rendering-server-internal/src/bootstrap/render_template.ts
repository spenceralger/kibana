/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

/* eslint-disable no-console */

import { BundleZones } from '@kbn/optimizer-bundle-zones';

export interface BootstrapTemplateData {
  themeTag: string;
  zoneBaseUrl: string;
  zones: BundleZones;
}

type Req = (key: string) => any;

function bootstrap({ themeTag, zoneBaseUrl, zones }: BootstrapTemplateData) {
  let fatalRendered = false;
  function fatal(error: unknown) {
    if (error) {
      console.error('FATAL ERROR', error);
    }
    if (fatalRendered) {
      return;
    }

    const errMessage =
      document.querySelector<HTMLElement>('[data-error-message]')?.dataset?.errorMessage;
    if (!errMessage) {
      return;
    }

    const err = document.createElement('h1');
    err.style.color = 'white';
    err.style.fontFamily = 'monospace';
    err.style.textAlign = 'center';
    err.style.background = '#F44336';
    err.style.padding = '25px';
    err.innerText = errMessage;

    // eslint-disable-next-line no-unsanitized/property
    document.body.innerHTML = err.outerHTML;
    fatalRendered = true;
  }

  function kbnBundlesLoader() {
    const scriptsTarget = document.querySelector('head meta[name="add-scripts-here"]')!;
    const own = Object.prototype.hasOwnProperty;
    const getModuleById = new Map<string, () => any>();
    const loaded = new Map<string, Promise<void>>();
    const plugins = new Map<string, string>();
    const jsonp = Object.create(null);
    let shared: unknown;
    let dll: unknown;

    function has(prop: string) {
      return own.call(getModuleById, prop);
    }

    function define(id: string, req: Req, internalId: string) {
      if (fatalRendered) {
        return;
      }

      if (has(id)) {
        throw new Error('__kbnBundles__ already has a module defined for "' + id + '"');
      }

      getModuleById.set(id, () => req(internalId));
    }

    function get(key: string) {
      const req = getModuleById.get(key);
      if (!req) {
        throw new Error('__kbnBundles__ does not have a module defined for "' + key + '"');
      }
      return req();
    }

    function reflect(source: object, target: object) {
      Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    }

    function expose(id: string, exports: Record<string, unknown>, req: any) {
      req.r(exports);
      reflect(get(id), exports);
    }

    function getPublicDir(bundleId: string) {
      return `${zoneBaseUrl}/${bundleId}/`;
    }

    function getUrl(bundleId: string) {
      return `${getPublicDir(bundleId)}${bundleId}.js`;
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

    function plugin(id: string, moduleId?: string) {
      if (moduleId !== undefined) {
        plugins.set(id, moduleId);
        return;
      }

      moduleId = plugins.get(id);
      const req = moduleId !== undefined ? getModuleById.get(moduleId) : undefined;
      if (req === undefined) {
        return undefined;
      }
      return req();
    }

    async function ensure(bundleIds: string[]) {
      await Promise.all(
        bundleIds
          .flatMap((id) => [id, ...getDepsDeep(id)])
          .map(async (id) => {
            const existing = loaded.get(id);
            if (existing) {
              await existing;
              return;
            }

            const promise = new Promise<void>((resolve) => {
              const dom = document.createElement('script');
              dom.async = false;
              dom.src = getUrl(id);
              dom.addEventListener('error', fatal);
              jsonp[id] = (exports: object) => {
                delete jsonp[id];

                if (id === '@kbn/ui-shared-deps-npm') {
                  dll = exports;
                } else if (id === '@kbn/ui-shared-deps-src') {
                  shared = exports;
                }

                resolve();
              };
              document.head.insertBefore(dom, scriptsTarget);
            });

            loaded.set(id, promise);
            await promise;
          })
      );
    }

    return {
      has,
      define,
      get,
      expose,
      ensure,
      getUrl,
      getPublicDir,
      plugin,
      jsonp,
      get shared() {
        return shared;
      },
      get dll() {
        return dll;
      },
    };
  }

  const global: typeof window & { [k: string]: unknown } = window as any;
  const kbnCsp = JSON.parse(document.querySelector('kbn-csp')!.getAttribute('data')!);
  const loader = kbnBundlesLoader();
  global.__kbnStrictCsp__ = kbnCsp.strictCsp;
  global.__kbnThemeTag__ = themeTag;
  global.__kbnBundles__ = loader;

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

      loader
        .ensure(zones.init)
        .then(() => loader.get('@kbn/core/public'))
        .then((core) => core.__kbnBootstrap__(), fatal);
    };
  }
}

export const renderTemplate = (data: BootstrapTemplateData) => {
  return `;(${bootstrap.toString()})(${JSON.stringify(data)});`;
};
