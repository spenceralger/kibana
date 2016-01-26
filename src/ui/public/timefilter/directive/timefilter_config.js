import UiModules from 'ui/modules';

import timefilterConfigHtml from './timefilter_config.html';

UiModules
.get('kibana')
.directive('kbnTimefilterConfig', function () {
  return {
    restrict: 'E',
    template: timefilterConfigHtml,
    controllerAs: 'timefilter',
    controller: function (timefilter) {
      return timefilter;
    }
  };
});
