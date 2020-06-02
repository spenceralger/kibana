/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../../api_integration/ftr_provider_context';

export default function({ getService }: FtrProviderContext) {
  describe('list', () => {
    it('lists all packages from the registry', async () => {
      const supertest = getService('supertest');
      const fetchPackageList = async () => {
        const response = await supertest
          .get('/api/ingest_manager/epm/packages')
          .set('kbn-xsrf', 'xxx')
          .expect(200);
        return response.body;
      };

      const listResponse = await fetchPackageList();
      expect(listResponse.response.length).to.be(12);
      expect(JSON.stringify(listResponse)).to.eql(JSON.stringify(registryListResponse));
    });
  });
}

const registryListResponse = {
  response: [
    {
      description: 'Get logs and metrics from AWS.',
      download: '/epr/aws/aws-0.0.2.tar.gz',
      icons: [
        {
          src: '/package/aws/0.0.2/img/icon.svg',
          type: 'image/svg+xml',
        },
      ],
      name: 'aws',
      path: '/package/aws/0.0.2',
      title: 'AWS',
      type: 'integration',
      version: '0.0.2',
      status: 'not_installed',
    },
    {
      description: 'This is the Elastic Endpoint package.',
      download: '/epr/endpoint/endpoint-1.0.0.tar.gz',
      icons: [
        {
          src: '/package/endpoint/1.0.0/img/logo-endpoint-64-color.svg',
          size: '16x16',
          type: 'image/svg+xml',
        },
      ],
      name: 'endpoint',
      path: '/package/endpoint/1.0.0',
      title: 'Elastic Endpoint',
      type: 'solution',
      version: '1.0.0',
      status: 'not_installed',
    },
    {
      description:
        "The log package should be used to create data sources for all type of logs for which an package doesn't exist yet.\n",
      download: '/epr/log/log-0.9.0.tar.gz',
      icons: [
        {
          src: '/package/log/0.9.0/img/icon.svg',
          type: 'image/svg+xml',
        },
      ],
      name: 'log',
      path: '/package/log/0.9.0',
      title: 'Log Package',
      type: 'integration',
      version: '0.9.0',
      status: 'not_installed',
    },
    {
      description:
        'This integration contains pretty long documentation.\nIt is used to show the different visualisations inside a documentation to test how we handle it.\nThe integration does not contain any assets except the documentation page.\n',
      download: '/epr/longdocs/longdocs-1.0.4.tar.gz',
      icons: [
        {
          src: '/package/longdocs/1.0.4/img/icon.svg',
          type: 'image/svg+xml',
        },
      ],
      name: 'longdocs',
      path: '/package/longdocs/1.0.4',
      title: 'Long Docs',
      type: 'integration',
      version: '1.0.4',
      status: 'not_installed',
    },
    {
      description: 'This is an integration with only the metrics category.\n',
      download: '/epr/metricsonly/metricsonly-2.0.1.tar.gz',
      icons: [
        {
          src: '/package/metricsonly/2.0.1/img/icon.svg',
          type: 'image/svg+xml',
        },
      ],
      name: 'metricsonly',
      path: '/package/metricsonly/2.0.1',
      title: 'Metrics Only',
      type: 'integration',
      version: '2.0.1',
      status: 'not_installed',
    },
    {
      description: 'Multiple versions of this integration exist.\n',
      download: '/epr/multiversion/multiversion-1.1.0.tar.gz',
      icons: [
        {
          src: '/package/multiversion/1.1.0/img/icon.svg',
          type: 'image/svg+xml',
        },
      ],
      name: 'multiversion',
      path: '/package/multiversion/1.1.0',
      title: 'Multi Version',
      type: 'integration',
      version: '1.1.0',
      status: 'not_installed',
    },
    {
      description: 'MySQL Integration',
      download: '/epr/mysql/mysql-0.0.2.tar.gz',
      icons: [
        {
          src: '/package/mysql/0.0.2/img/logo_mysql.svg',
          title: 'logo mysql',
          size: '32x32',
          type: 'image/svg+xml',
        },
      ],
      name: 'mysql',
      path: '/package/mysql/0.0.2',
      title: 'MySQL',
      type: 'integration',
      version: '0.0.2',
      status: 'not_installed',
    },
    {
      description: 'Nginx Integration',
      download: '/epr/nginx/nginx-0.0.3.tar.gz',
      icons: [
        {
          src: '/package/nginx/0.0.3/img/logo_nginx.svg',
          title: 'logo nginx',
          size: '32x32',
          type: 'image/svg+xml',
        },
      ],
      name: 'nginx',
      path: '/package/nginx/0.0.3',
      title: 'Nginx',
      type: 'integration',
      version: '0.0.3',
      status: 'not_installed',
    },
    {
      description: 'Redis Integration',
      download: '/epr/redis/redis-0.0.2.tar.gz',
      icons: [
        {
          src: '/package/redis/0.0.2/img/logo_redis.svg',
          title: 'logo redis',
          size: '32x32',
          type: 'image/svg+xml',
        },
      ],
      name: 'redis',
      path: '/package/redis/0.0.2',
      title: 'Redis',
      type: 'integration',
      version: '0.0.2',
      status: 'not_installed',
    },
    {
      description:
        'This package is used for defining all the properties of a package, the possible assets etc. It serves as a reference on all the config options which are possible.\n',
      download: '/epr/reference/reference-1.0.0.tar.gz',
      icons: [
        {
          src: '/package/reference/1.0.0/img/icon.svg',
          size: '32x32',
          type: 'image/svg+xml',
        },
      ],
      name: 'reference',
      path: '/package/reference/1.0.0',
      title: 'Reference package',
      type: 'integration',
      version: '1.0.0',
      status: 'not_installed',
    },
    {
      description: 'System package',
      download: '/epr/system/system-0.0.2.tar.gz',
      icons: [
        {
          src: '/package/system/0.0.2/img/compute.svg',
          size: '16x16',
          type: 'image/svg+xml',
        },
      ],
      name: 'system',
      path: '/package/system/0.0.2',
      title: 'System',
      type: 'integration',
      version: '0.0.2',
      status: 'not_installed',
    },
    {
      description: 'This package contains a yaml pipeline.\n',
      download: '/epr/yamlpipeline/yamlpipeline-1.0.0.tar.gz',
      name: 'yamlpipeline',
      path: '/package/yamlpipeline/1.0.0',
      title: 'Yaml Pipeline package',
      type: 'integration',
      version: '1.0.0',
      status: 'not_installed',
    },
  ],
  success: true,
};
