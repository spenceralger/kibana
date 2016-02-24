import ngMock from 'ngMock';
import expect from 'expect.js';
import sinon from 'auto-release-sinon';

import RequestQueueProv from '../_request_queue';
import EsDocStrategyProv from '../fetch_types/es_doc_strategy';
import EsSearchStrategyProv from '../fetch_types/es_search_strategy';

describe('Courier Request Queue', function () {
  let requestQueue;
  let esDocStrategy;
  let esSearchStrategy;

  beforeEach(ngMock.module('kibana'));
  beforeEach(ngMock.inject(function (Private) {
    requestQueue = Private(RequestQueueProv);
    esDocStrategy = Private(EsDocStrategyProv);
    esSearchStrategy = Private(EsSearchStrategyProv);
  }));

  class MockReq {
    constructor(strategy, startable = true) {
      this.strategy = strategy;
      this.source = {};
      this.canStart = sinon.stub().returns(startable);
    }
  }

  describe('#getStartable(strategy)', function () {
    it('only returns requests that match one of the passed strategies', function () {
      requestQueue.push(
        new MockReq(esDocStrategy),
        new MockReq(esSearchStrategy),
        new MockReq(esSearchStrategy),
        new MockReq(esSearchStrategy)
      );

      expect(requestQueue.getStartable(esDocStrategy)).to.have.length(1);
      expect(requestQueue.getStartable(esSearchStrategy)).to.have.length(3);
    });

    it('returns all requests when no strategy passed', function () {
      requestQueue.push(
        new MockReq(esDocStrategy),
        new MockReq(esSearchStrategy)
      );

      expect(requestQueue.getStartable()).to.have.length(2);
    });

    it('returns only startable requests', function () {
      requestQueue.push(
        new MockReq(esDocStrategy, true),
        new MockReq(esSearchStrategy, false)
      );

      expect(requestQueue.getStartable()).to.have.length(1);
    });
  });

  describe('#get(strategy)', function () {
    it('only returns requests that match one of the passed strategies', function () {
      requestQueue.push(
        new MockReq(esDocStrategy),
        new MockReq(esSearchStrategy),
        new MockReq(esSearchStrategy),
        new MockReq(esSearchStrategy)
      );

      expect(requestQueue.get(esDocStrategy)).to.have.length(1);
      expect(requestQueue.get(esSearchStrategy)).to.have.length(3);
    });

    it('returns all requests when no strategy passed', function () {
      requestQueue.push(
        new MockReq(esDocStrategy),
        new MockReq(esSearchStrategy)
      );

      expect(requestQueue.get()).to.have.length(2);
    });

    it('returns startable and not-startable requests', function () {
      requestQueue.push(
        new MockReq(esDocStrategy, true),
        new MockReq(esSearchStrategy, false)
      );

      expect(requestQueue.get()).to.have.length(2);
    });
  });
});
