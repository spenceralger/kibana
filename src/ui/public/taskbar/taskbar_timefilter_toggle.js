import { clone } from 'lodash';
import UiModules from 'ui/modules';

import taskbarTimefilterToggleHtml from './templates/taskbar_timefilter_toggle.html';
import timefilterConfigHtml from './templates/taskbar_timefilter_config.html';
import timefilterConfigIntervalHtml from './templates/taskbar_timefilter_config_interval.html';

UiModules
.get('kibana')
.directive('kbnTaskbarTimefilterToggle', function (timefilter, globalState) {
  return {
    restrict: 'E',
    require: '^kbnTaskbar',
    template: taskbarTimefilterToggleHtml,

    controllerAs: 'toggle',
    controller() {
      this.init = (taskbar, timefilter) => {
        this.enabled = () => timefilter.enabled;
        this.toggleRefresh = () => timefilter.refreshInterval.pause = !timefilter.refreshInterval.pause;
        this.refreshSet = () => timefilter.refreshInterval.value > 0;
        this.refreshPaused = () => !!timefilter.refreshInterval.pause;
        this.isOpenTo = (name) => taskbar.configTemplate.is(name);
        this.isOpen = () => !!taskbar.configTemplate.current;
        this.toggleFilterTemplate = (name) => taskbar.configTemplate.toggle(name);

        taskbar.configTemplate.add('timefilterInterval', timefilterConfigIntervalHtml);
        taskbar.configTemplate.add('timefilterFilter', timefilterConfigHtml);
      };
    },

    link($scope, $attr, $el, taskbar) {
      $scope.timefilter = timefilter;
      $scope.taskbar = taskbar;
      $scope.toggle.init(taskbar, timefilter);

      $scope.$listen(timefilter, 'update', function (newVal, oldVal) {
        globalState.time = clone(timefilter.time);
        globalState.refreshInterval = clone(timefilter.refreshInterval);
        globalState.save();
      });
    },
  };
});
