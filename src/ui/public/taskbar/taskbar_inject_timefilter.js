import UiModules from 'ui/modules';

UiModules
.get('kibana')
.directive('kbnTaskbarInjectTimefilter', function (timefilter) {
  return {
    restrict: 'A',
    priority: 100,
    controller($scope) {
      $scope.timefilter = timefilter;
    }
  };
});
