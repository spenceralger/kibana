import sinon from 'auto-release-sinon';
import expect from 'expect.js';
import ngMock from 'ngMock';

import EsSegmentedRequestProvider from '../es_segmented_request';
import EsSearchRequestProvider from '../es_search_request';

describe('ui/courier/fetch/request/segmented', () => {
  let Promise;
  let $rootScope;
  let EsSegmentedReq;
  let esSegmentedReq;
  let esSearchReqStart;

  beforeEach(ngMock.module('kibana'));

  beforeEach(ngMock.inject((Private, $injector) => {
    Promise = $injector.get('Promise');
    $rootScope = $injector.get('$rootScope');
    EsSegmentedReq = Private(EsSegmentedRequestProvider);
    esSearchReqStart = sinon.spy(Private(EsSearchRequestProvider).prototype, 'start');
  }));

  describe('#start()', () => {
    let returned;
    beforeEach(() => {
      init();
      returned = esSegmentedReq.start();
    });

    it('returns promise', () => {
      expect(returned.then).to.be.Function;
    });

    it('does not call super.start() until promise is resolved', () => {
      expect(esSearchReqStart.called).to.be(false);
      $rootScope.$apply();
      expect(esSearchReqStart.called).to.be(true);
    });
  });

  function init() {
    esSegmentedReq = new EsSegmentedReq(mockSource());
  }

  function mockSource() {
    return {
      get: sinon.stub().returns(mockIndexPattern())
    };
  }

  function mockIndexPattern() {
    return {
      toDetailedIndexList: sinon.stub().returns(Promise.resolve([
        { index: 1, min: 0, max: 1 },
        { index: 2, min: 0, max: 1 },
        { index: 3, min: 0, max: 1 },
      ]))
    };
  }
});
