import _ from 'lodash';
import moment from 'moment';

import errors from 'ui/errors';

import RequestQueueProvider from '../_request_queue';

export default function AbstractRequestProvider(Private, Promise) {
  const requestQueue = Private(RequestQueueProvider);

  const onStop = Symbol('onStopMethod');
  const whenAbortedHandlers = Symbol('whenAbortedHandlers');

  return class AbstractRequest {
    /**
     * Initialize the request and add it to the couriers request
     * queue so that the request will be considered for execution
     * by the courier
     *
     * @constructor
     */
    constructor() {
      if (this.constructor === AbstractRequest) {
        throw new Error('AbstractRequest should not be constructed directly');
      }

      this[whenAbortedHandlers] = [];
      requestQueue.push(this);
    }

    /**
     * Determine if the request can be started
     * @return {Boolean}
     */
    canStart() {
      return Boolean(!this.stopped);
    }

    /**
     * Mark the request as started
     *
     * @return {undefined}
     */
    start() {
      if (this.started) {
        throw new TypeError('Unable to start request because it has already started');
      }

      this.started = true;
      this.moment = moment();
    }

    /**
     * Mark the request as successful
     *
     * @return {undefined}
     */
    handleResponse(resp) {
      this.success = true;
    }

    /**
     * Mark the request as failed
     *
     * @return {undefined}
     */
    handleFailure(error) {
      this.success = false;
    }

    /**
     * Check to see if this request could be continued
     *
     * @return {Boolean}
     */
    isIncomplete() {
      return false;
    }

    /**
     * Mark this request as continued, or in this case
     * throw an error because requests are not continuable
     * by default
     *
     * @return {undefined}
     */
    continue() {
      throw new Error('Unable to continue ' + this.type + ' request');
    }

    /**
     * Retry this request by aborting the current request
     * and reentering the request in the request queue
     *
     * @return {AbstractRequest}
     */
    retry() {
      const clone = this.clone();
      this.abort();
      return clone;
    }

    /**
     * Mark the request as stopped and remove it from
     * the request queue. Used by both #abort() and
     * #complete().
     *
     * @private
     * @return {undefined}
     */
    [onStop]() {
      if (this.stopped) return;

      this.stopped = true;
      _.pull(requestQueue, this);
    }

    /**
     * Mark the request as aborted and remove it from the
     * request queue.
     *
     * @return {undefined}
     */
    abort() {
      this[onStop]();
      this.aborted = true;
      _.callEach(this[whenAbortedHandlers]);
    }

    /**
     * Add a function that should be called when this
     * request is aborted.
     *
     * @param  {Function} cb - the function to call
     * @return {undefined}
     */
    whenAborted(cb) {
      this[whenAbortedHandlers].push(cb);
    }

    /**
     * Mark this request as complete and remove it from
     * the request queue.
     *
     * @return {undefined}
     */
    complete() {
      this[onStop]();
      this.ms = this.moment.diff() * -1;
    }

    /**
     * Create a clone of this request. Used when retrying a
     * request. Causes the new request to be added to the
     * request queue.
     *
     * @return {AbstractRequest} - the clone
     */
    clone() {
      return new this.constructor();
    }
  };
};
