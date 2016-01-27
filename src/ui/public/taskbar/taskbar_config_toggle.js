import UiModules from 'ui/modules';

import taskbarConfigToggleHtml from './templates/taskbar_config_toggle.html';

UiModules
.get('kibana')
.directive('kbnTaskbarConfigToggle', function () {
  return {
    restrict: 'E',
    require: '^kbnTaskbar',
    scope: {
      templateName: '@',
      description: '@',
    },
    transclude: true,
    controllerAs: 'configToggle',
    bindToController: true,
    controller() {},
    link($scope, $el, $attr, taskbar) {
      $scope.taskbar = taskbar;
      $scope.$watch('taskbar.configTemplate.is(configToggle.templateName)', function (active) {
        $el.toggleClass('active', active);
      });
    },
    template: taskbarConfigToggleHtml
  };
});
