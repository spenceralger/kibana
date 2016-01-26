import UiModules from 'ui/modules';

UiModules
.get('kibana')
.directive('kbnTaskbarSearch', function () {
  return {
    restrict: 'E',
    scope: {
      onSubmit: '&',
      historyId: '@',
      ngModel: '='
    },
    template: require('./search.html'),
    bindToController: true,
    controllerAs: 'search',
    controller() {}
  };
});
