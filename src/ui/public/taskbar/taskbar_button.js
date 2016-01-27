import UiModules from 'ui/modules';

import taskbarButtonHtml from './templates/taskbar_button.html';

UiModules
.get('kibana')
.directive('kbnTaskbarButton', function () {
  return {
    restrict: 'E',
    require: '^kbnTaskbar',
    scope: {
      description: '@',
      ngClass: '=?',
      ariaHasPopup: '=?',
      ariaExpanded: '=?'
    },
    transclude: true,
    controllerAs: 'button',
    bindToController: true,
    controller() {},
    link($scope, $el, $attr, taskbar) {
      $scope.taskbar = taskbar;
    },
    template: taskbarButtonHtml
  };
});
