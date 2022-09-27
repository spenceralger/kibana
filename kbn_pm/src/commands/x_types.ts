/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { AxiosResponse } from 'axios';

type FileChangeType = 'MODIFIED' | 'ADDED' | 'DELETED';

export type FetchPrsResponse = AxiosResponse<{
  data: {
    repository: {
      pullRequests: {
        nodes: Array<{
          id: string;
          number: number;
          files: {
            nodes: Array<{
              changeType: FileChangeType;
              path: string;
            }>;
            pageInfo: {
              endCursor: string;
              hasNextPage: boolean;
            };
          };
        }>;
        pageInfo: {
          endCursor: string;
          hasNextPage: boolean;
        };
      };
    };
  };
}>;

export type MoreFilesResponse = AxiosResponse<{
  data: {
    [key: string]: {
      number: number;
      files: {
        nodes: Array<{
          changeType: FileChangeType;
          path: string;
        }>;
        pageInfo: {
          endCursor: string;
          hasNextPage: boolean;
        };
      };
    };
  };
}>;

export interface FetchedPr {
  id: string;
  number: number;
  addedFiles: string[];
}
