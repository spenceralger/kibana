import _ from 'lodash';

import EsSearchStrategyProvider from './es_search_strategy';
import DataSourceRequestProvider from './data_source_request';

export default function SearchReqProvider(Private) {

  const esSearchStrategy = Private(EsSearchStrategyProvider);
  const DataSourceRequest = Private(DataSourceRequestProvider);

  return class EsSearchReq extends DataSourceRequest {
    constructor(...args) {
      super(...args);

      this.type = 'es_search';
      this.strategy = esSearchStrategy;
    }
  };
};
