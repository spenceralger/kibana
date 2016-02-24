import _ from 'lodash';

import EsDocStrategyProvider from './es_doc_strategy';
import DataSourceRequestProvider from './data_source_request';

export default function DocRequestProvider(Private) {

  const esDocStrategy = Private(EsDocStrategyProvider);
  const DataSourceRequest = Private(DataSourceRequestProvider);

  return class EsDocRequest extends DataSourceRequest {
    constructor(...args) {
      super(...args);

      this.type = 'es_doc';
      this.strategy = esDocStrategy;
    }

    canStart() {
      const parent = super.canStart();
      if (!parent) return false;

      const version = this.source._version;
      const storedVersion = this.source._getStoredVersion();

      // conditions that equal "fetch This DOC!"
      const unknown = !version && !storedVersion;
      const mismatch = version !== storedVersion;

      return Boolean(mismatch || (unknown && !this.started));
    }

    handleResponse(resp) {
      if (resp.found) {
        this.source._storeVersion(resp._version);
      } else {
        this.source._clearVersion();
      }

      return super.handleResponse(resp);
    }
  };
};
