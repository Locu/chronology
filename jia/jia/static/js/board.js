var app = angular.module('boardApp', ['ui.codemirror',
                                      'ui.bootstrap',
                                      'jia.timeseries',
                                      'jia.table',
                                      'jia.gauge'
                                     ]);

app.config(['$interpolateProvider', function($interpolateProvider) {
  // Using {[ ]} to avoid collision with server-side {{ }}.
  $interpolateProvider.startSymbol('{[');
  $interpolateProvider.endSymbol(']}');
}]);

// Add data to acceptable hrefs for CSV to be generated client side
app.config(['$compileProvider', function($compileProvider) {
  $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|ftp|mailto|data):/);
}]);

app.controller('boardController',
['$scope', '$http', '$location', '$timeout', '$injector',
function ($scope, $http, $location, $timeout, $injector) {
  // TODO(marcua): Re-add the sweet periodic UI refresh logic I cut
  // out of @usmanm's code in the Angular rewrite.
  var location = $location.absUrl().split('/');
  var boardId = location[location.length - 1];

  $scope.editorOptions = {
    lineWrapping: true,
    lineNumbers: true,
    mode: 'python',
    theme: 'mdn-like',
  };

  this.loadVisualizations = function () {
    var visualizations = {};
    _.each(app.requires, function (dependency) {
      if (dependency.indexOf('jia.') == 0) {
        module = dependency.substring('jia.'.length);
        visualizations[module] = $injector.get(module);
      }
    });
    return visualizations;
  };

  $scope.visualizations = this.loadVisualizations();

  $scope.changeVisualization = function(panel, type) {
    // Avoid recalculating stuff if the user selects the type that is already being viewed
    if (type.meta.title != panel.display.display_type) {
      panel.display.display_type = type.meta.title;
      panel.cache.visualizations[type.meta.title] = new type.visualization();
      panel.cache.visualization = panel.cache.visualizations[type.meta.title];
      panel.cache.visualization.setData(panel.cache.data);
    }
    panel.cache.visualizationDropdownOpen = false;
  };

  $scope.callAllSources = function() {
    _.each($scope.boardData.panels, function(panel) {
      $scope.callSource(panel);
    });
  };

  $scope.callSource = function(panel) {
    panel.cache.loading = true;
    
    $http.post('/callsource', panel.data_source)
      .success(function(data, status, headers, config) {
        panel.cache.data = data;
        panel.cache.visualization.setData(data);
      })
      .error(function(data, status, headers, config) {
        // TODO(marcua): display error.
        console.log(data);
      })
      .finally(function() {
        panel.cache.loading = false;
      });
  };
  
  $scope.downloadCSV = function (panel, event) {
    var csv = []; // CSV represented as 2D array
    var headerString = 'data:text/csv;charset=utf-8,';
    
    try {
      var data = panel.cache.data.events;
      if (!data.length) {
        throw "No data";
      }
    } catch (e) {
      event.target.href = headerString;
      return;
    }

    // Create line for titles
    var titles = Object.keys(data[0]);
    csv.push([]);
    for (var title in titles) {
      csv[0].push(titles[title]);
    }

    // Add all dictionary values
    for (var i in data) {
      var row = data[i];
      var newRow = [];
      for (var j in row) {
        var point = row[j];
        newRow.push(point);
      }
      csv.push(newRow);
    }

    var csvString = '';

    for (var i in csv) {
      var row = csv[i];
      for (var j in row) {
        var cell = row[j] === null ? '' : row[j].toString();
        var result = cell.replace(/"/g, '""');
        if (result.search(/("|,|\n)/g) >= 0) {
          result = '"' + result + '"';
        }
        if (j > 0) {
          csvString += ',';
        }
        csvString += result;
      }
      csvString += '\n';
    }

    event.target.href = headerString + encodeURIComponent(csvString);
  };

  $scope.saveBoard = function() {
    // Deep copy the board data and remove the cached data.
    var data = JSON.parse(JSON.stringify($scope.boardData, function(key, value) {
      if (key === 'cache') {
        return undefined;
      }
      return value;
    }));

    // TODO(marcua): display something on save success/failure.
    $http.post('/board/' + boardId, data)
      .success(function(data, status, headers, config) {
        console.log('saved');
      })
      .error(function(data, status, headers, config) {
        console.log('error!');
      });
  };

  $scope.initPanel = function(panel) {
    panel.cache = {
      data: {events: [{'@time': 0, '@value': 0}]},
      visualizations: {}
    };

    // Initialize the active visualization type
    var visualizationType = panel.display.display_type;
    var newVisualization = new $scope.visualizations[visualizationType].visualization();
    panel.cache.visualizations[visualizationType] = newVisualization;
    panel.cache.visualization = panel.cache.visualizations[visualizationType];

    // Flag to toggle bootstrap dropdown menu status
    panel.cache.visualizationDropdownOpen = false;
  };

  $scope.addPanel = function() {
    var panel = {
      title: '',
      data_source: {
        source_type: 'pycode',
        refresh_seconds: null,
        code: ''
      },
      display: {
        display_type: 'timeseries'
      }
    };
    $scope.boardData.panels.unshift(panel);
    $scope.initPanel($scope.boardData.panels[0]);
  };

  $http.get('/board/' + boardId)
    .success(function(data, status, headers, config) {
      angular.forEach(data.panels, function(panel) {
        $scope.initPanel(panel);
      });
      $scope.boardData = data;
    });
}]);

app.directive('visualization', function ($http, $compile) {
  var linker = function($scope, element, attrs) {
    $scope.$watch('module', function () {
      $http.get(['static', 'visualizations', $scope.module.meta.title, $scope.module.meta.template].join('/'))
        .success(function(data, status, headers, config) {
          element.html(data);
          $compile(element.contents())($scope);
        });
    });
  }

  return {
    restrict: "E",
    replace: true,
    link: linker,
    scope: {
      module:'='
    }
  };
});