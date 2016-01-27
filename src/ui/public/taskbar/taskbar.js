import UiModules from 'ui/modules';

import './taskbar.less';
import './taskbar_button';
import './taskbar_config_toggle';
import './taskbar_config';
import './taskbar_search';
import './taskbar_timefilter_toggle';
import './taskbar_inject_timefilter';

UiModules
.get('kibana')
.directive('kbnTaskbar', function () {
  return {
    restrict: 'E',
    scope: {
      configTemplate: '=',
      configObject: '='
    },
    bindToController: true,
    controllerAs: 'taskbar',
    controller($attrs, $scope, $element) {
      this.configObjectName = $attrs.configObjectName || $attrs.configObject;

      $scope.$watch('taskbar.configTemplate.current', (template) => {
        $element.toggleClass('config-open', !!template);
      });
    }
  };
});
