import UiModules from 'ui/modules';

import template from './templates/taskbar_search.html';

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
    template,
    bindToController: true,
    controllerAs: 'search',
    controller() {}
  };
});
