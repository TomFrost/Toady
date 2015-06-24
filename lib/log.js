/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

var log = require('bristol');
var config = require('config');

/**
 * Sets up a new logging target based on a configuration object
 * @param {Object} conf An object with target configuration settings
 * @param {string} conf.target The name of the target to be added
 * @param {Object} [conf.target_options] An optional map of options that
 *    will be sent to the chosen logging target
 * @param {string} [conf.formatter] The name of the message formatter to use
 * @param {Object} [conf.formatter_options] An optional map of options that
 *    will be sent to the chosen formatter
 * @param {string} [conf.low] The lowest severity level that should be reported
 *    to this target
 * @param {string} [conf.high] The highest severity level that should be
 *    reported to this target
 */
function addTarget(conf) {
  var opts = log.addTarget(conf.target, conf.target_options || {});
  if (conf.formatter) {
    opts.withFormatter(conf.formatter, conf.formatter_options || {});
  }
  if (conf.low) {
    opts.withLowestSeverity(conf.low);
  }
  if (conf.high) {
    opts.withHighestSeverity(conf.high);
  }
}

config.log.forEach(addTarget);

module.exports = log;
