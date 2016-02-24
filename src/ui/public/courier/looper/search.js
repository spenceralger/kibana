import FetchProvider from '../fetch';
import EsSearchStrategyProvider from '../fetch_types/es_search_strategy';
import GenericStrategyProvider from '../fetch_types/generic_strategy';
import RequestQueueProvider from '../_request_queue';
import LooperProvider from './_looper';

export default function SearchLooperService(Private, Promise, Notifier, $rootScope) {
  var fetch = Private(FetchProvider);
  var esSearchStrategy = Private(EsSearchStrategyProvider);
  var genericStrategy = Private(GenericStrategyProvider);
  var requestQueue = Private(RequestQueueProvider);

  var Looper = Private(LooperProvider);
  var notif = new Notifier({ location: 'Search Looper' });

  /**
   * The Looper which will manage the doc fetch interval
   * @type {Looper}
   */
  var searchLooper = new Looper(null, function () {
    $rootScope.$broadcast('courier:searchRefresh');
    return fetch.these(
      requestQueue.getInactive(esSearchStrategy, genericStrategy)
    );
  });

  searchLooper.onHastyLoop = function () {
    if (searchLooper.afterHastyQueued) return;

    searchLooper.afterHastyQueued = Promise.resolve(searchLooper.active)
    .then(function () {
      return searchLooper._loopTheLoop();
    })
    .finally(function () {
      searchLooper.afterHastyQueued = null;
    });
  };

  return searchLooper;
};
