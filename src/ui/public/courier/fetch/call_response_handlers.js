import { RequestFailure } from 'ui/errors';

import 'ui/promises';

import ReqStatusProvider from './req_status';
import NotifierProvider from './notifier';

export default function CourierFetchCallResponseHandlers(Private, Promise) {
  const ABORTED = Private(ReqStatusProvider).ABORTED;
  const INCOMPLETE = Private(ReqStatusProvider).INCOMPLETE;
  const notify = Private(NotifierProvider);


  function callResponseHandlers(requests, responses) {
    return Promise.map(requests, function (req, i) {
      if (req === ABORTED || req.aborted) {
        return ABORTED;
      }

      const resp = responses[i];

      function progress() {
        if (req.isIncomplete()) {
          return INCOMPLETE;
        }

        req.complete();
        return resp;
      }

      if (resp.error) {
        if (req.filterError(resp)) {
          return progress();
        } else {
          return req.handleFailure(new RequestFailure(null, resp));
        }
      }

      return Promise.try(function () {
        return req.handleResponse(resp);
      })
      .then(progress);
    });
  }

  return callResponseHandlers;
};
