import UiModules from 'ui/modules';

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
    template:`
      <kbn-taskbar-button
        description="{{ configToggle.description }}"
        ng-click="taskbar.configTemplate.toggle(configToggle.templateName);"
        aria-haspopup="true"
        aria-expanded="taskbar.configTemplate.is(configToggle.templateName)">
        <ng-transclude></ng-transclude>
      </kbn-tooltip>
    `
  };
});
