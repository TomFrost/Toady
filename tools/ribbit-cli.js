/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

// Dependencies
var _ = require('lodash');
var ribbit = require('../app/ribbit/Ribbit');
var util = require('util');

// Parse command and arguments
var cmd = process.argv[2] ? process.argv[2].toLowerCase() : '';
var args = process.argv.slice(3).join(' ');

// Route command
switch (cmd) {
  case 'start':
    startToady(args); break;
  case 'search':
    search(args); break;
  case 'install':
    install(args); break;
  case 'uninstall':
    uninstall(args); break;
  default:
    printUsage();
    process.exit(1);
}

/**
 * Outputs a fatal error message and exits.
 * @param {Error} err An error object to display
 * @param {number} [code=1] The exit code with which to exit the process.
 */
function exitFatal(err, code) {
  if (code === undefined || code === null) {
    code = 1;
  }
  console.log(err.stack);
  process.exit(code);
}

/**
 * Installs a given Toady mod.
 * @param {string} modName The name of the mod to be installed, without the
 *      prefix
 */
function install(modName) {
  var modPkg = ribbit.MOD_PREFIX + modName;
  console.log('Installing ' + modPkg + '...');
  ribbit.install(modName, function(err) {
    if (err) {
      exitFatal(err);
    } else {
      console.log('Installed!');
    }
  });
}

/**
 * Outputs usage instructions to stdout.
 */
function printUsage() {
  var usage = [
    'USAGE: ./ribbit <command> [options]\n',
    'COMMANDS:',
    '  start [config]   Starts Toady. Loads the \'default\' config, unless',
    '                   you specify a different one.',
    '  search [term]    Searches for Toady mods that can be installed.  If',
    '                   the search term is omitted, we\'ll list everything!',
    '  install <mod>    Installs a Toady mod.  If Toady is currently running,',
    '                   use /msg Toady loadmod <mod> in IRC to load it up.',
    '  uninstall <mod>  Uninstalls an installed mod.  If Toady is currently',
    '                   running, consider /msg Toady unloadmod <mod> first.'
  ];
  usage.forEach(console.log);
}

/**
 * Lists any Toady mods matching the search query, or all mods if no query
 * is provided.
 * @param {string} query A search query to limit the results
 */
function search(query) {
  ribbit.search(query).then(function(resObj) {
    if (!resObj.modIds || !resObj.modIds.length) {
      throw new Error('No results for "' + query + '.');
    }
    var maxId = resObj.modIds.reduce(function(a, b) {
      return Math.max(a.length || 0, b.length || 0);
    }, 0);
    var maxDesc = process.stdout.columns - maxId - 4;
    console.log('');
    resObj.modIds.forEach(function(modId) {
      console.log(util.format('%s  %s',
        _.padRight(modId, maxId),
        resObj.res[ribbit.MOD_PREFIX + modId].description.substr(0, maxDesc)
      ));
    });
  }).catch(exitFatal);
}

/**
 * Starts an instance of Toady.  If called with no arguments, Toady will
 * be started using config/default.yaml as the config file.  Otherwise,
 * Toady will attempt to load config/{ARGS}.yaml.
 * @param {string} [configName] The name of the config to load
 */
function startToady(configName) {
  if (configName === 'default') {
    configName = null;
  }
  if (configName) {
    process.env.NODE_ENV = args;
  }
  require('../app/Toady');
}

/**
 * Uninstalls a Toady mod.
 * @param {string} modId An installed mod ID to be deleted
 */
function uninstall(modId) {
  var modPkg = ribbit.MOD_PREFIX + modId;
  console.log('Uninstalling ' + modPkg + '...');
  ribbit.uninstall(modId).then(function() {
    console.log('Uninstalled.');
  }).catch(exitFatal);
}
