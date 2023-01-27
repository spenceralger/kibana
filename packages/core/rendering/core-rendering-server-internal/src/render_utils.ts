/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import UiSharedDepsNpm from '@kbn/ui-shared-deps-npm';
import type { UiSettingsParams, UserProvidedValues } from '@kbn/core-ui-settings-common';

export const getSettingValue = <T>(
  settingName: string,
  settings: {
    user?: Record<string, UserProvidedValues<unknown>>;
    defaults: Readonly<Record<string, Omit<UiSettingsParams, 'schema'>>>;
  },
  convert: (raw: unknown) => T
): T => {
  const value = settings.user?.[settingName]?.userValue ?? settings.defaults[settingName].value;
  return convert(value);
};

export const getStylesheetPaths = ({}: {
  themeVersion: UiSharedDepsNpm.ThemeVersion;
  darkMode: boolean;
  buildNum: number;
  basePath: string;
}) => {
  return [];
};
