import _ from 'lodash';
import sinon from 'auto-release-sinon';
import expect from 'expect.js';
import ngMock from 'ngMock';

import FetchTheseProvider from '../fetch_these';
import ContinueIncompleteProvider from '../continue_incomplete';
import CallResponseHandlersProvider from '../call_response_handlers';

describe('ui/courier - fetch_these', () => {

  let Promise;
  let $rootScope;
  let fetchThese;
  let request;
  let requests;
  let fakeResponses;

  beforeEach(ngMock.module('kibana', (PrivateProvider) => {
    function FakeResponsesProvider(Promise) {
      fakeResponses = sinon.spy(function () {
        return Promise.map(requests, mockRequest => {
          return { mockRequest };
        });
      });
      return fakeResponses;
    }

    PrivateProvider.swap(CallResponseHandlersProvider, FakeResponsesProvider);
    PrivateProvider.swap(ContinueIncompleteProvider, FakeResponsesProvider);
  }));

  beforeEach(ngMock.inject((Private, $injector) => {
    $rootScope = $injector.get('$rootScope');
    Promise = $injector.get('Promise');
    fetchThese = Private(FetchTheseProvider);
    request = mockRequest();
    requests = [ request ];
  }));

  context('when request has not started', () => {
    beforeEach(() => requests.forEach(req => req.started = false));

    it('starts request', () => {
      fetchThese(requests);
      expect(request.start.called).to.be(true);
      expect(request.continue.called).to.be(false);
    });

    it('waits for returned promise from start() to be fulfilled', () => {
      request.start = sinon.stub().returns(Promise.resolve(request));
      fetchThese(requests);

      expect(request.start.callCount).to.be(1);
      expect(fakeResponses.callCount).to.be(0);
      $rootScope.$apply();
      expect(fakeResponses.callCount).to.be(2);
    });

    it('invokes request failure handler if starting fails', () => {
      request.start = sinon.stub().returns(Promise.reject('some error'));
      fetchThese(requests);
      $rootScope.$apply();
      sinon.assert.calledWith(request.handleFailure, 'some error');
    });
  });

  context('when request has already started', () => {
    it('continues request', () => {
      fetchThese(requests);
      expect(request.start.called).to.be(false);
      expect(request.continue.called).to.be(true);
    });
    it('waits for returned promise to be fulfilled', () => {
      request.continue = sinon.stub().returns(Promise.resolve(request));
      fetchThese(requests);

      expect(request.continue.callCount).to.be(1);
      expect(fakeResponses.callCount).to.be(0);
      $rootScope.$apply();
      expect(fakeResponses.callCount).to.be(2);
    });
    it('invokes request failure handler if continuing fails', () => {
      request.continue = sinon.stub().returns(Promise.reject('some error'));
      fetchThese(requests);
      $rootScope.$apply();
      sinon.assert.calledWith(request.handleFailure, 'some error');
    });
  });

  function mockRequest() {
    return {
      strategy: {
        type: 'mock',
        execute() {}
      },
      started: true,
      aborted: false,
      handleFailure: sinon.spy(),
      retry: sinon.spy(function () { return this; }),
      continue: sinon.spy(function () { return this; }),
      start: sinon.spy(function () { return this; })
    };
  }
});
