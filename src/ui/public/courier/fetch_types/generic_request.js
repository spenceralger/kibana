import _ from 'lodash';

import GenericStrategyProvider from './generic_strategy';
import AbstractRequestProvider from './abstract_request';

export default function GenericRequestProvider(Private) {
  const genericStrategy = Private(GenericStrategyProvider);
  const AbstractRequest = Private(AbstractRequestProvider);

  return class GenericRequest extends AbstractRequest {
    constructor(fn) {
      super();

      this.fn = fn;
      this.type = 'generic';
      this.strategy = genericStrategy;
    }
  };
};
