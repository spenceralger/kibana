import clone from 'lodash';

import UiModules from 'ui/modules';
import toggleHtml from './timefilter_toggle.html';
import ConfigTemplate from 'ui/ConfigTemplate';
import 'ui/timefilter';

UiModules
.get('kibana')
.directive('kbnTimefilterToggle', function () {
  return {
    restrict: 'E',
    template: toggleHtml,
    controllerAs: 'toggle',
    controller: function ($scope, timefilter, globalState) {

      $scope.$listen(timefilter, 'update', function (newVal, oldVal) {
        globalState.time = clone(timefilter.time);
        globalState.refreshInterval = clone(timefilter.refreshInterval);
        globalState.save();
      });

      this.timefilter = timefilter;

      this.enabled = function () {
        return timefilter.enabled;
      };

      this.toggleRefresh = function () {
        return timefilter.refreshInterval.pause = !timefilter.refreshInterval.pause;
      };

      this.refreshSet = function () {
        return timefilter.refreshInterval.value > 0;
      };

      this.refreshPaused = function () {
        return !!timefilter.refreshInterval.pause;
      };

      this.isOpenTo = function (name) {
        return timefilter.configTemplate.is(name);
      };

      this.isOpen = function () {
        return !!timefilter.configTemplate.current;
      };

      this.toggleFilterTemplate = function (name) {
        return timefilter.configTemplate.toggle(name);
      };


    }
  };
});
