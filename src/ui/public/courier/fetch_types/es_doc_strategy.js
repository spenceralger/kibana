import EsAbstractStrategyProvider from './es_abstract_strategy';

export default function FetchStrategyForDoc(Private, Promise) {
  const EsAbstractStrategy = Private(EsAbstractStrategyProvider);

  return new class EsDocStrategy extends EsAbstractStrategy {
    constructor() {
      super();
      this.clientMethod = 'mget';
    }

    /**
     * Flatten a series of requests into as ES request body
     * @param  {array} requests - an array of flattened requests
     * @return {Promise} - a promise that is fulfilled by the request body
     */
    reqsFetchParamsToBody(reqsFetchParams) {
      return Promise.resolve({
        docs: reqsFetchParams
      });
    }

    /**
     * Fetch the multiple responses from the ES Response
     * @param  {object} resp - The response sent from Elasticsearch
     * @return {array} - the list of responses
     */
    getResponses(resp) {
      return resp.docs;
    }
  };
};
