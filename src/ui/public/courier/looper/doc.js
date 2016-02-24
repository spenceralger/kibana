import FetchProvider from '../fetch';
import LooperProvider from './_looper';
import EsDocStrategyProvider from '../fetch_types/es_doc_strategy';

export default function DocLooperService(Private) {
  var fetch = Private(FetchProvider);
  var Looper = Private(LooperProvider);
  var esDocStrategy = Private(EsDocStrategyProvider);

  /**
   * The Looper which will manage the doc fetch interval
   * @type {Looper}
   */
  var docLooper = new Looper(1500, function () {
    fetch.fetchQueued(esDocStrategy);
  });

  return docLooper;
};
