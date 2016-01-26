import $ from 'jquery';

import UiModules from 'ui/modules';
import ConfigTemplate from 'ui/ConfigTemplate';
import kbnChromeHtml from './kbn_chrome.html';
import './kbn_chrome.less';

export default function (chrome, internals) {

  UiModules
  .get('kibana')
  .directive('kbnChrome', function ($rootScope) {
    return {
      template($el) {
        const $content = $(kbnChromeHtml);
        const $app = $content.find('kbn-app-container');

        if (internals.rootController) {
          $app.attr('ng-controller', internals.rootController);
        }

        if (internals.rootTemplate) {
          $app.removeAttr('ng-view');
          $app.html(internals.rootTemplate);
        }

        return $content;
      },

      controllerAs: 'chrome',
      controller($scope, $rootScope, $location, $http) {

        // are we showing the embedded version of the chrome?
        internals.setVisibleDefault(!$location.search().embed);

        // listen for route changes, propogate to tabs
        const onRouteChange = function () {
          let { href } = window.location;
          let persist = chrome.getVisible();
          internals.tabs.consumeRouteUpdate(href, persist);
          internals.trackPossibleSubUrl(href);
        };

        $rootScope.$on('$routeChangeSuccess', onRouteChange);
        $rootScope.$on('$routeUpdate', onRouteChange);
        onRouteChange();

        // and some local values
        $scope.httpActive = $http.pendingRequests;
        $scope.notifList = require('ui/notify')._notifs;

        return chrome;
      }
    };
  });

}
