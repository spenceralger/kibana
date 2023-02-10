/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { createFailError } from '@kbn/dev-cli-errors';

export function fail(msg: string): never {
  throw createFailError(`
    ${msg}, make sure to run the following before executing this command:

      node scripts/build_kibana_platform_plugins --dist
  `);
}
