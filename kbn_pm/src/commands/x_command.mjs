/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { createCliError } from '../lib/cli_error.mjs';

/** @type {import('../lib/command').Command} */
export const command = {
  name: '_x',
  async run({ log }) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw createCliError('you must set GITHUB_TOKEN');
    }

    const { default: Axios } = await import('axios');
    const http = Axios.create({
      baseURL: 'https://api.github.com/graphql',
      headers: {
        Authorization: `bearer ${token}`,
      },
    });

    const PR_INDEX_GQL = `
      # Type queries into this side of the screen, and you will
      # see intelligent typeaheads aware of the current GraphQL type schema,
      # live syntax, and validation errors highlighted within the text.

      # We'll get you started with a simple query showing your username!
      query ($prCursor: String) {
        repository(name: "kibana", owner: "elastic") {
          pullRequests(first: 100, baseRefName: "main", states: OPEN, after: $prCursor) {
            nodes {
              id
              number
              files(first: 100) {
                nodes {
                  changeType
                  path
                }
                pageInfo {
                  endCursor
                  hasNextPage
                }
              }
            }
            pageInfo {
              endCursor
              hasNextPage
            }
          }
        }
        rateLimit {
          cost
          remaining
        }
      }
    `;

    async function* iterPrs() {
      /** @type {string | undefined} */
      let prCursor;
      while (true) {
        /** @type {import('./x_types').FetchPrsResponse} */
        const resp = await http.request({
          method: 'post',
          data: {
            query: PR_INDEX_GQL,
            variables: {
              prCursor,
            },
          },
        });

        const { nodes, pageInfo: prPageInfo } = resp.data.data.repository.pullRequests;
        prCursor = prPageInfo.endCursor;

        /** @type {import('./x_types').FetchedPr[]} */
        const completePrs = [];

        /** @type {Array<{ filesCursor: string, fetched: import('./x_types').FetchedPr }>} */
        const incompletePrs = [];

        for (const pr of nodes) {
          const addedFiles = pr.files.nodes.flatMap((n) =>
            n.changeType === 'ADDED' ? n.path : []
          );

          /** @type {import('./x_types').FetchedPr} */
          const fetched = {
            id: pr.id,
            number: pr.number,
            addedFiles,
          };

          if (pr.files.pageInfo.hasNextPage) {
            incompletePrs.push({
              filesCursor: pr.files.pageInfo.endCursor,
              fetched,
            });
          } else {
            completePrs.push(fetched);
          }
        }

        while (incompletePrs.length) {
          /** @type {string[]} */
          const gqlSnippets = [];
          /** @type {Map<number, import('./x_types').FetchedPr>} */
          const fetchedPrsByNumber = new Map();

          for (const { filesCursor, fetched } of incompletePrs) {
            fetchedPrsByNumber.set(fetched.number, fetched);
            gqlSnippets.push(`
              pr_${fetched.number}: node (id: ${JSON.stringify(fetched.id)}) {
                ... on PullRequest {
                  number
                  files(first:100, after:${JSON.stringify(filesCursor)}) {
                    nodes {
                      changeType
                      path
                    }
                    pageInfo {
                      endCursor
                      hasNextPage
                    }
                  }
                }
              }
            `);
          }

          incompletePrs.length = 0;

          /** @type {import('./x_types').MoreFilesResponse} */
          const moreFilesResp = await http.request({
            method: 'post',
            data: {
              query: `
                query {
                  ${gqlSnippets.join('\n')}
                }
              `,
            },
          });

          for (const pr of Object.values(moreFilesResp.data.data)) {
            const fetched = fetchedPrsByNumber.get(pr.number);

            if (!fetched) {
              throw new Error('pr mismatch');
            }

            for (const file of pr.files.nodes) {
              if (file.changeType === 'ADDED') {
                fetched.addedFiles.push(file.path);
              }
            }

            if (!pr.files.pageInfo.hasNextPage) {
              completePrs.push(fetched);
            } else {
              incompletePrs.push({
                filesCursor: pr.files.pageInfo.endCursor,
                fetched,
              });
            }
          }
        }

        yield completePrs;

        if (!prPageInfo.hasNextPage) {
          break;
        }
      }
    }

    for await (const prs of iterPrs()) {
      log.info('loaded', prs.length, 'prs');
      for (const pr of prs) {
        const addedPackageJson = pr.addedFiles.find((f) => f.endsWith('/package.json'));
        if (addedPackageJson) {
          log.warning(`PR #${pr.number} added a package ${addedPackageJson}`);
        }
      }
    }
  },
};
