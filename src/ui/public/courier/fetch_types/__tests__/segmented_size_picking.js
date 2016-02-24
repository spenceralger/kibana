import ngMock from 'ngMock';
import expect from 'expect.js';
import { times } from 'lodash';
import sinon from 'auto-release-sinon';

import HitSortFnProv from 'plugins/kibana/discover/_hit_sort_fn';
import NoDigestPromises from 'testUtils/noDigestPromises';
import StubbedSearchSourceProvider from 'fixtures/stubbed_search_source';

import EsSegmentedRequestProvider from '../es_segmented_request';

describe('Segmented Request Size Picking', function () {
  let Promise;
  let HitSortFn;
  let $rootScope;
  let MockSource;
  let EsSegmentedReq;

  NoDigestPromises.activateForSuite();

  beforeEach(ngMock.module('kibana'));
  beforeEach(ngMock.inject((Private, $injector) => {
    Promise = $injector.get('Promise');
    HitSortFn = Private(HitSortFnProv);
    $rootScope = $injector.get('$rootScope');
    EsSegmentedReq = Private(EsSegmentedRequestProvider);

    MockSource = class {
      constructor() {
        return $injector.invoke(StubbedSearchSourceProvider);
      }
    };
  }));

  context('without a size', function () {
    it('does not set the request size', async function () {
      const req = new EsSegmentedReq(new MockSource());
      req._handle.setDirection('desc');
      req._handle.setSortFn(new HitSortFn('desc'));
      await req.start();

      expect((await req.getFetchParams()).body).to.not.have.property('size');
    });
  });

  context('with a size', function () {
    it('sets the request size to the entire desired size', async function () {
      const req = new EsSegmentedReq(new MockSource());
      req._handle.setDirection('desc');
      req._handle.setSize(555);
      req._handle.setSortFn(new HitSortFn('desc'));
      await req.start();

      expect((await req.getFetchParams()).body).to.have.property('size', 555);
    });
  });
});
