/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

// this package is loaded before any other so that it can initialize special
// package stuff

// load some polyfill packages
require('core-js/stable');
require('@babel/runtime/regenerator');
require('whatwg-fetch');
require('symbol-observable');

// ensure jQuery is attached to the window
const Jquery = require('jquery');
window.$ = window.jQuery = Jquery;

// mutates window.jQuery and window.$
require('@kbn/flot-charts');

// mutate moment to include timezone information
const Moment = require('moment');
require('moment-timezone');
Moment.tz.load(require('moment-timezone/data/packed/latest.json'));
