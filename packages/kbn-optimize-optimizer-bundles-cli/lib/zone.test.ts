/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { createAnyInstanceSerializer } from '@kbn/jest-serializers';
import { Stats } from './stats';
import { Zone } from './zone';

expect.addSnapshotSerializer(
  createAnyInstanceSerializer(
    Zone,
    (z: Zone) => `Zone (size: ${z.size}, ids: ${z.pkgIds.join(',')})`
  )
);

describe('Zone#add()', () => {
  it('adds the pkgId and its non-shared deps to the zone', () => {
    const stats = new Stats([
      {
        id: 'a',
        deps: ['b'],
        shared: true,
        size: 1,
      },
      {
        id: 'b',
        deps: ['c'],
        shared: false,
        size: 2,
      },
      {
        id: 'c',
        deps: ['d'],
        shared: true,
        size: 3,
      },
      {
        id: 'd',
        deps: ['b'],
        shared: false,
        size: 4,
      },
      {
        id: 'e',
        deps: ['a', 'b', 'c', 'd'],
        shared: true,
        size: 5,
      },
    ]);

    const z1 = new Zone(stats, 0, []);
    const z2 = z1.add('a');
    expect(z2).toMatchInlineSnapshot(`<Zone (size: 3, ids: a,b)>`);
    const z3 = z2.add('c');
    expect(z3).toMatchInlineSnapshot(`<Zone (size: 10, ids: a,b,c,d)>`);
    const z4 = z3.add('e');
    expect(z4).toMatchInlineSnapshot(`<Zone (size: 15, ids: a,b,c,d,e)>`);
  });
});
