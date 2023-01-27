/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

export interface BootstrapTemplateData {
  themeTag: string;
  publicPathMap: Record<string, string>;
  zoneBaseUrl: string;
}

type RequireFn = (key: string) => unknown;

function boostrapFunction(themeTag: string, publicPathMap: string, zoneBaseUrl: string) {
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
    const reqs = new Map<string, RequireFn>();
    const zones = new Map<string, { pending: boolean; promise: Promise<void> }>();
    const jsonp = Object.create(null);

    function has(prop: string) {
      return reqs.has(prop);
    }

    function define(key: string, req: RequireFn) {
      if (has(key)) {
        throw new Error('__kbnBundles__ already has a module defined for "' + key + '"');
      }
      reqs.set(key, req);
    }

    function get(key: string) {
      const req = reqs.get(key);
      if (!req) {
        throw new Error('__kbnBundles__ does not have a module defined for "' + key + '"');
      }
      return req(key);
    }

    function ensure(zoneIds: string[], cb: () => void) {
      Promise.all(
        zoneIds.map((id) => {
          const existing = zones.get(id);
          if (existing) {
            return existing;
          }

          const promise = new Promise<void>((resolve, reject) => {
            const dom = document.createElement('script');
            dom.async = false;
            dom.src = `${zoneBaseUrl}/${id}/${id}.js`;
            dom.addEventListener('error', reject);
            jsonp[id] = () => resolve();
            document.head.insertBefore(dom, scriptsTarget);
          });

          zones.set(id, { pending: true, promise });
          return promise;
        })
      ).then(
        () => {
          cb();
        },
        (error) => {
          // eslint-disable-next-line no-console
          console.error('failed to load zone:', error);
          fatal();
        }
      );
    }

    return { has, define, get, ensure, jsonp };
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

      global.__kbnBundles__.ensure(['zone1', 'zone2', 'zone3', 'zone4', 'zone5'], function () {
        global.__kbnBundles__.get('@kbn/core/public').__kbnBootstrap__();
      });
    };
  }
}

export const renderTemplate = ({ themeTag, publicPathMap, zoneBaseUrl }: BootstrapTemplateData) => {
  return `'use strict';
(${boostrapFunction.toString()}).apply(null, ${JSON.stringify([
    themeTag,
    publicPathMap,
    zoneBaseUrl,
  ])});
`;
};
