/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { createHash } from 'crypto';
import { PackageInfo } from '@kbn/config';
import { ThemeVersion } from '@kbn/ui-shared-deps-npm';
import type { KibanaRequest, HttpAuth } from '@kbn/core-http-server';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-server';
import type { UiPlugins } from '@kbn/core-plugins-base-server-internal';
import { REPO_ROOT } from '@kbn/repo-info';
import { getPkgsByPluginId } from '@kbn/repo-packages';
import { filterUiPlugins } from '../filter_ui_plugins';
import { getThemeTag } from './get_theme_tag';
import { renderTemplate } from './render_template';

export type BootstrapRendererFactory = (factoryOptions: FactoryOptions) => BootstrapRenderer;
export type BootstrapRenderer = (options: RenderedOptions) => Promise<RendererResult>;

interface FactoryOptions {
  serverBasePath: string;
  packageInfo: PackageInfo;
  uiPlugins: UiPlugins;
  auth: HttpAuth;
}

interface RenderedOptions {
  request: KibanaRequest;
  uiSettingsClient: IUiSettingsClient;
  isAnonymousPage?: boolean;
}

interface RendererResult {
  body: string;
  etag: string;
}

export const bootstrapRendererFactory: BootstrapRendererFactory = ({
  packageInfo,
  serverBasePath,
  uiPlugins,
  auth,
}) => {
  const isAuthenticated = (request: KibanaRequest) => {
    const { status: authStatus } = auth.get(request);
    // status is 'unknown' when auth is disabled. we just need to not be `unauthenticated` here.
    return authStatus !== 'unauthenticated';
  };

  return async function bootstrapRenderer({ uiSettingsClient, request, isAnonymousPage = false }) {
    let darkMode = false;
    const themeVersion: ThemeVersion = 'v8';

    try {
      const authenticated = isAuthenticated(request);
      darkMode = authenticated ? await uiSettingsClient.get('theme:darkMode') : false;
    } catch (e) {
      // just use the default values in case of connectivity issues with ES
    }

    const themeTag = getThemeTag({
      themeVersion,
      darkMode,
    });
    const buildHash = packageInfo.buildNum;
    const regularBundlePath = `${serverBasePath}/${buildHash}/bundles`;

    const pkgsByPluginId = getPkgsByPluginId(REPO_ROOT);
    const body = renderTemplate({
      themeTag,
      zoneBaseUrl: regularBundlePath,
      zones: {
        init: [
          '@kbn/ui-shared-deps-npm',
          '@kbn/ui-shared-deps-src',
          '@kbn/core',
          ...filterUiPlugins({ uiPlugins, isAnonymousPage }).flatMap(([id]) => {
            const pkg = pkgsByPluginId.get(id);
            return pkg ? pkg.id : [];
          }),
        ],
        deps: {},
      },
    });

    const hash = createHash('sha1');
    hash.update(body);
    const etag = hash.digest('hex');

    return {
      body,
      etag,
    };
  };
};
