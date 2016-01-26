require('ui/modules')
.get('kibana')
.directive('discoverSearch', function () {
  return {
    restrict: 'E',
    template: require('./discover_search.html')
  };
});
