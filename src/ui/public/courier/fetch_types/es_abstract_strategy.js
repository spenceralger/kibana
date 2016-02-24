import _ from 'lodash';

import { RequestFailure, SearchTimeout, ShardFailure } from 'ui/errors';

import IsRequestProvider from '../fetch/is_request';
import ReqStatusProvider from '../fetch/req_status';
import NotifierProvider from '../fetch/notifier';
import AbstractStrategyProvider from './abstract_strategy';

export default function EsClientExecutorProvider(Private, Promise, es, esShardTimeout, sessionId) {
  const notify = Private(NotifierProvider);
  const isRequest = Private(IsRequestProvider);
  const AbstractStrategy = Private(AbstractStrategyProvider);

  const { ABORTED, DUPLICATE } = Private(ReqStatusProvider);

  return class EsAbstractStrategy extends AbstractStrategy {
    constructor() {
      super();
      if (this.constructor === EsAbstractStrategy) {
        throw new Error('EsAbstractStrategy should not be constructed directly');
      }
    }

    /**
     * Convert the list of requests into the body which should be sent to
     * elasticsearch.
     *
     * @return {Any}
     */
    reqsFetchParamsToBody() {
      throw new Error('this method must be overriden by subclassses of EsAbstractStrategy');
    }

    /**
     * Convert the response from elasticsearch into an array of ordered responses
     * which matches the request order.
     *
     * @return {Array[Any]}
     */
    getResponses() {
      throw new Error('this method must be overriden by subclassses of EsAbstractStrategy');
    }

    /**
     * Combine any requests that are the same, so that they are
     * only executed in elasticsearch once.
     *
     * Duplicate values are converted into DUPLICATE status
     * objects, and deduplcilated on response
     *
     * @private
     * @param  {Array[Requests]} requests
     * @return {Array[Requests]}
     */
    mergeDuplicateRequests(requests) {
      // dedupe requests
      const index = {};
      return requests.map(function (req) {
        if (!isRequest(req)) return req;

        const iid = req.source._instanceid;
        if (!index[iid]) {
          // this request is unique so far
          index[iid] = req;
          // keep the request
          return req;
        }

        // the source was requested at least twice
        req._uniq = index[iid];
        return DUPLICATE;
      });
    }

    /**
     * Called by the courier when requests with this strategy must
     * be executed.
     *
     * @param  {Array[Request]} requests
     * @return {Promise<Responses>}
     */
    execute(requests) {
      // merging docs can change status to DUPLICATE, capture new statuses
      const statuses = this.mergeDuplicateRequests(requests);

      // get the actual list of requests that we will be fetching
      const executable = statuses.filter(isRequest);
      let execCount = executable.length;

      // resolved by respond()
      let esPromise;
      const defer = Promise.defer();

      const checkForEsError = (req, resp) => {
        if (resp.error && req.filterError && !req.filterError(resp)) {
          return new RequestFailure(null, resp);
        }

        if (resp.timed_out) {
          notify.warning(new SearchTimeout());
        }

        if (resp._shards && resp._shards.failed) {
          notify.warning(new ShardFailure(resp));
        }

        return resp;
      };

      // for each respond with either the response or ABORTED
      const respond = (responses) => {
        responses = responses || [];
        return Promise.map(requests, (req, i) => {
          switch (statuses[i]) {
            case ABORTED:
              return ABORTED;
            case DUPLICATE:
              return req._uniq.resp;
            default:
              return checkForEsError(req, responses[_.findIndex(executable, req)]);
          }
        })
        .then(
          (res) => defer.resolve(res),
          (err) => defer.reject(err)
        );
      };

      // handle a request being aborted while being fetched
      const requestWasAborted = Promise.method((req, i) => {
        if (statuses[i] === ABORTED) {
          defer.reject(new Error('Request was aborted twice?'));
        }

        execCount -= 1;
        if (execCount > 0) {
          // the multi-request still contains other requests
          return;
        }

        if (esPromise && _.isFunction(esPromise.abort)) {
          esPromise.abort();
        }

        esPromise = ABORTED;

        return respond();
      });


      // attach abort handlers, close over request index
      statuses.forEach((req, i) => {
        if (!isRequest(req)) return;
        req.whenAborted(() => {
          requestWasAborted(req, i).catch(defer.reject);
        });
      });


      // Now that all of THAT^^^ is out of the way, lets actually
      // call out to elasticsearch
      Promise.map(executable, (req) => {
        return Promise.try(req.getFetchParams, void 0, req)
        .then((fetchParams) => {
          return (req.fetchParams = fetchParams);
        });
      })
      .then((reqsFetchParams) => {
        return this.reqsFetchParamsToBody(reqsFetchParams);
      })
      .then((body) => {
        // while the reqsFetchParamsToBody was converting, our request may have been aborted
        if (esPromise === ABORTED) {
          throw ABORTED;
        }

        return (esPromise = es[this.clientMethod]({
          timeout: esShardTimeout,
          ignore_unavailable: true,
          preference: sessionId,
          body: body
        }));
      })
      .then((clientResp) => {
        return this.getResponses(clientResp);
      })
      .then(respond)
      .catch((err) => {
        if (err === ABORTED) respond();
        else defer.reject(err);
      });

      // return our promise, but catch any errors we create and
      // send them to the requests
      return defer.promise
      .catch((err) => {
        requests.forEach((req, i) => {
          if (statuses[i] !== ABORTED) {
            req.handleFailure(err);
          }
        });
      });
    }
  };

}
