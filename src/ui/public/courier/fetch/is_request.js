import AbstractRequestProvider from '../fetch_types/abstract_request';

export default function IsRequestProvider(Private) {
  const AbstractRequest = Private(AbstractRequestProvider);

  return function isRequest(obj) {
    return obj instanceof AbstractRequest;
  };
};
