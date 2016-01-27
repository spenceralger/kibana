import UiModules from 'ui/modules';

import taskbarConfigHtml from './templates/taskbar_config.html';

UiModules
.get('kibana')
.directive('kbnTaskbarConfig', function () {
  return {
    restrict: 'E',
    require: '^kbnTaskbar',
    scope: {},
    controllerAs: 'config',
    bindToController: true,
    link($scope, $el, $attr, taskbar) {
      $scope.taskbar = taskbar;
    },
    controller() {},
    template: taskbarConfigHtml
  };
});
