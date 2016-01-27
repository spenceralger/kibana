import UiModules from 'ui/modules';

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
    template:`
      <kbn-tooltip text="{{ button.description }}" placement="bottom" append-to-body="1">
        <button
          type="button"
          ng-class="button.ngClass"
          aria-haspopup="{{ button.ariaHasPopup }}"
          aria-expanded="{{ button.ariaExpanded }}"
          aria-label="{{ button.description }}">
          <ng-transclude></ng-transclude>
        </button>
      </kbn-tooltip>
    `
  };
});
