/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

/**
 * Mod Control provides commands allowing modules to be loaded, unloaded,
 * and reloaded without restarting the bot or reconnecting to chat.
 * @param {Object} config A Toady config object
 * @param {Object} client An IRC client object
 * @param {Object} modMan The Toady ModManager object
 * @returns {Object} A Toady mod
 */
module.exports = function(config, client, modMan) {
  /**
   * Returns a closure that executes the given function name on the
   * ModManager object.
   * @param {string} funcName The name of the ModManager function to be
   *    executed when the closure is called
   * @param {string} actText The past-tense verb to be displayed when the
   *    function is executed successfully, such as "loaded" or "unloaded"
   * @returns {Function} A closure that executes the given function, and
   *    accepts arguments appropriate for use as a command handler
   */
  function modAction(funcName, actText) {
    return function(from, to, target, args, inChan) {
      var replyTo = inChan ? to : from;
      modMan[funcName](args[0], function(err) {
        client.notice(replyTo, err ? err.message :
          ("Mod '" + args[0] + "' " + actText + '.'));
      });
    };
  }

  return {
    name: 'Mod Control',
    desc: 'Allows mods to be loaded and unloaded dynamically',
    author: 'Tom Frost',
    commands: {
      loadmod: {
        handler: modAction('loadMod', 'loaded'),
        desc: 'Loads any mod placed into the "mods" folder by its folder name',
        help: [
          'Format: {cmd} <modID>',
          'Example:',
          '  /msg {nick} {cmd} remote'
        ],
        pattern: /^(\S+)$/,
        minPermission: 'S'
      },
      reloadmod: {
        handler: modAction('reloadMod', 'reloaded'),
        desc: 'Reloads any currently loaded mod by its modID',
        help: [
          'Format: {cmd} <modID>',
          'Example:',
          '  /msg {nick} {cmd} modcontrol'
        ],
        pattern: /^(\S+)$/,
        minPermission: 'S'
      },
      unloadmod: {
        handler: modAction('unloadMod', 'unloaded'),
        desc: 'Unloads any currently loaded mod by its modID',
        help: [
          'Format: {cmd} <modID>',
          'Example:',
          '  /msg {nick} {cmd} remote'
        ],
        pattern: /^(.\S+)$/,
        minPermission: 'S'
      }
    }
  };
};
