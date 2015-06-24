/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

// Dependencies
var irc = require('../lib/irc');
var log = require('../lib/log');
var ModManager = require('./modmanager/ModManager');

irc.setMaxListeners(0);
irc.addListener('error', function(err) {
  log.error(err);
});

log.info('Loading Core modules...');
ModManager.loadCoreMods().then(function() {
  log.info('Loading User modules...');
  return ModManager.loadUserMods();
}).then(function() {
  log.info('Connecting to IRC...');
  return irc.connect(3);
}).then(function() {
  log.info('Connected.');
}).catch(function(err) {
  log.error(err);
  throw err;
});
