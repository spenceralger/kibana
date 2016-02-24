import IsRequestProvider from '../fetch/is_request';
import AbstractStrategyProvider from './abstract_strategy';

export default function GenericStrategyProvider(Promise, Private) {
  const isRequest = Private(IsRequestProvider);
  const AbstractStrategy = Private(AbstractStrategyProvider);

  return new class GenericStrategy extends AbstractStrategy {
    execute(requests) {
      return Promise.map(requests, req => {
        if (isRequest(req)) {
          return Promise.try(req.fn);
        } else {
          return req;
        }
      });
    }
  };
}
