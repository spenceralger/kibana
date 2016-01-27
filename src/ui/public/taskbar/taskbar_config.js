import UiModules from 'ui/modules';

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
    template:`
      <config
        config-template="taskbar.configTemplate"
        config-object="taskbar.configObject"
        config-close="taskbar.configTemplate.close()">
      </config>
    `
  };
});
