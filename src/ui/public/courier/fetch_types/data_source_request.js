import notify from 'ui/notify';

import AbstractRequestProvider from './abstract_request';
import ErrorHandlersProvider from '../_error_handlers';

export default function DataSourceRequestProvider(Private, Promise) {
  const errorHandlers = Private(ErrorHandlersProvider);
  const AbstractRequest = Private(AbstractRequestProvider);

  return class DataSourceRequest extends AbstractRequest {

    /**
     * Overriden to track the source for this request
     *
     * @override
     * @constructor
     */
    constructor(source, defer) {
      super();

      this.defer = defer || Promise.defer();
      this.source = source;
    }

    /**
     * Overriden to consult wether the source has fetch disabled for
     * some reason
     *
     * @override
     * @return {Boolean}
     */
    canStart() {
      return Boolean(super.canStart() && !this.source._fetchDisabled);
    }

    /**
     * Read the data source to produce fetch params for the elastisearch client
     *
     * @return {Object} - request parameters for the es client
     */
    getFetchParams() {
      return this.source._flatten();
    }

    /**
     * Overridden to track the active request count on the search source
     *
     * @override
     * @return {undefined}
     */
    start() {
      super.start();

      const source = this.source;
      if (source.activeFetchCount) {
        source.activeFetchCount += 1;
      } else {
        source.activeFetchCount = 1;
      }

      source.history = [this];
    }

    /**
     * Overridden to track the active request count on the
     * search source and to dereference the defer
     *
     * @override
     * @return {undefined}
     */
    abort() {
      if (this.stopped) return;

      super.abort();
      this.defer = null;
      this.source.activeFetchCount -= 1;
    }

    /**
     * Overridden to track the response, which will
     * later be sent to the defer
     *
     * @override
     * @return {undefined}
     */
    handleResponse(resp) {
      super.handleResponse();
      this.resp = resp;
    }

    /**
     * Overridden to track the response from the error, which will
     * later be sent to the defer
     *
     * @override
     * @return {undefined}
     */
    handleFailure(error) {
      super.handleFailure();

      this.resp = error && error.resp;
      const ownHandlers = [];
      const otherHandlers = [];
      errorHandlers.forEach(handler => {
        const list = handler.source === this.source ? ownHandlers : otherHandlers;
        list.push(handler);
      });

      // remove all handlers from errorHandlers and replace
      // them with just the list of other listeners
      errorHandlers.splice(0, errorHandlers.length, otherHandlers);

      if (!ownHandlers.length) {
        notify.fatal(new Error(`unhandled courier request error: ${notify.describeError(error) }`));
      } else {
        ownHandlers.forEach(handler => handler.defer.resolve(error));
      }

      this.retry();
    }

    /**
     * Overridden to send response to the defer
     *
     * @override
     * @return {undefined}
     */
    complete() {
      super.complete();
      this.source.activeFetchCount -= 1;
      this.defer.resolve(this.resp);
    }

    /**
     * Overridden to inject the source argument when cloned
     *
     * @override
     * @return {undefined}
     */
    clone() {
      return new this.constructor(this.source, this.defer);
    }
  };
};
