/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { FtrConfigProviderContext } from '@kbn/test/types/ftr';
import { defineDockerServersConfig } from '@kbn/test';

export default async function({ readConfigFile }: FtrConfigProviderContext) {
  const xPackAPITestsConfig = await readConfigFile(require.resolve('../api_integration/config.js'));
  return {
    testFiles: [require.resolve('./apis')],
    servers: xPackAPITestsConfig.get('servers'),
    dockerServers: defineDockerServersConfig(
      process.env.INGEST_MANAGEMENT_PACKAGE_REGISTRY_PORT
        ? {
            registry: {
              image: 'docker.elastic.co/package-registry/package-registry:v0.4.0',
              portInContainer: 8080,
              port: process.env.INGEST_MANAGEMENT_PACKAGE_REGISTRY_PORT,
              waitForLogLine: 'package manifests loaded into memory',
            },
          }
        : {}
    ),
    services: {
      supertest: xPackAPITestsConfig.get('services.supertest'),
      es: xPackAPITestsConfig.get('services.es'),
    },
    junit: {
      reportName: 'X-Pack EPM API Integration Tests',
    },

    esTestCluster: {
      ...xPackAPITestsConfig.get('esTestCluster'),
    },

    kbnTestServer: {
      ...xPackAPITestsConfig.get('kbnTestServer'),
      serverArgs: [
        ...xPackAPITestsConfig.get('kbnTestServer.serverArgs'),
        `--xpack.ingestManager.epm.registryUrl=http://localhost:${process.env.INGEST_MANAGEMENT_PACKAGE_REGISTRY_PORT}`,
      ],
    },
  };
}
