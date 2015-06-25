/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

var ModConfig = require('../modmanager/ModConfig');
var util = require('util');

/**
 * Config provides commands allowing privileged users to update config
 * values on a given mod.  It restricts access to only those configuration
 * items called out by the target mod itself, and ensures that submissions
 * match the config item's specified value and, optionally, regex pattern.
 * @param {Object} config A Toady config object
 * @param {Object} client An IRC client object
 * @param {Object} modMan The Toady ModManager object
 * @returns {Object} A Toady mod
 */
module.exports = function(config, client, modMan) {
  /**
   * Changes a mod's config value.  The only values that can be changed are
   * the ones defined in a given mod's configItems property, and the change
   * will only be successful if the value is of the right type and passes
   * validation.
   *
   * This function should ALWAYS be used when altering a different mod's
   * config, as calling config.save() may save properties that the target
   * mod does not want or expect to have in its config file.  This may render
   * the *.yaml config useless to the end user and should be avoided.  This
   * function will only save properties that already exist within the target
   * mod's config file, plus the new config option being set.
   * @param {string} modId The ID of the target mod
   * @param {string} key The config key to be changed in the target mod
   * @param {string|number|boolean} val The value to be set. If a string is
   *    provided for the value, it will be converted to the config item's
   *    target type before being saved.
   * @returns {Promise} Resolves on complete.
   */
  function setConfig(modId, key, val) {
    var mod = modMan.getMod(modId.toLowerCase());
    return Promise.resolve().then(function() {
      if (!mod) {
        throw new Error("Mod '" + modId + "' doesn't exist or isn't loaded.");
      } else if (!mod.configItems || !mod.configItems[key]) {
        throw new Error('Config item ' + modId + '.' + key +
          ' does not exist or cannot be edited live.');
      }
      val = transformValue(mod, key, val);
      validateValue(mod, key, val);
      return ModConfig.getModConfigFile(modId);
    }).then(function(modFile) {
      if (modFile) {
        var props = Object.keys(modFile);
        props.push(key);
        mod.config[key] = this.vars.newVal;
        return mod.config.save(props);
      }
    });
  }

  /**
   * Shows the current value for a config key to a nick or channel.
   * @param {string} replyTo The nick or channel to which messages should
   *    be sent
   * @param {string} modId The ID of the mod whose config will be viewed
   * @param {string} key The config key to be shown
   */
  function showConfig(replyTo, modId, key) {
    var mod = modMan.getMod(modId.toLowerCase());
    if (!mod) {
      client.notice(replyTo, "Mod '" + modId +
        "' doesn't exist or isn't loaded.");
    } else if (!mod.configItems || !mod.configItems[key]) {
      client.notice(replyTo, 'Config item ' + modId + '.' + key +
         'does not exist or cannot be edited live.');
    } else {
      client.notice(replyTo, util.format('%s.%s: {%s} %s'),
        mod.id,
        key,
        mod.configItems[key].type || 'string',
        mod.config[key] === undefined ? '(unset)' : mod.config[key]
      );
    }
  }

  /**
   * Validates that a value matches the format required by a specific
   * config item, and converts strings to that type if necessary.
   * @param {Object} mod The mod whose config is being altered
   * @param {string} key The config key being altered on the given mod
   * @param {string|number|boolean} val The provided value
   * @returns {string|number|boolean} The converted value.
   * @throws {Error} if the val is not of the expected type.
   */
  function transformValue(mod, key, val) {
    switch (mod.configItems[key].type) {
      case 'boolean':
        val += '';
        if (val.match(/^(?:1|true)$/i)) {
          val = true;
        } else if (val.match(/^(?:0|false)$/i)) {
          val = false;
        } else {
          throw new Error(mod.id + '.' + key +
            ' requires a boolean value: 1 or 0, true or false.');
        }
        break;
      case 'number':
        val = parseFloat(val);
        if (isNaN(val)) {
          throw new Error(mod.id + '.' + key + 'requires a numerical value.');
        }
        break;
    }
    return val;
  }

  /**
   * Validates a value against a config item's 'validate' function, if it
   * exists for the given mod.  If it does not exist, validation passes
   * automatically.
   *
   * Note that the value provided to this function should already be of the
   * type specified in the config item.  This can be achieved by calling
   * {@link #transformValue}.
   * @param {Object} mod The mod whose config is being altered
   * @param {string} key The config key being altered on the given mod
   * @param {string|number|boolean} val The value to be validated
   * @throws {Error} if the validation fails.
   */
  function validateValue(mod, key, val) {
    // TODO: All validate functions should have to throw an error.
    // TODO: Validate functions should be able to return a Promise
    if (mod.configItems[key].validate) {
      var res = mod.configItems[key].validate(val);
      if (res instanceof Error) {
        throw res;
      } else if (!res) {
        throw new Error('Incorrect format for ' + mod.id + '.' + key);
      }
    }
  }

  return {
    name: 'Config',
    desc: 'Allows mods to expose configuration items for live changes',
    author: 'Tom Shawver',
    commands: {
      setconfig: {
        handler: function(from, to, target, args, inChan) {
          var replyTo = inChan ? to : from;
          setConfig(args[1], args[2], args[3]).then(function() {
            client.notice(replyTo, 'Value saved.');
          }).catch(function(err) {
            client.notice(replyTo, err.message);
          });
        },
        desc: 'Sets a config option on a specified mod',
        help: [
          'Format: {cmd} <modID>.<configKey> <value>',
          'Example:',
          '  /msg {nick} {cmd} somelogger.mysqlPort 6003',
          '  {!}{cmd} changreeter.greeting Howdy! I\'m {nick}!'
        ],
        pattern: /^([a-zA-Z0-9_\-]+)\.([a-zA-Z0-9_]+)\s(.+)$/,
        minPermission: 'S'
      },
      viewconfig: {
        handler: function(from, to, target, args, inChan) {
          showConfig(inChan ? to : from, args[1], args[2]);
        },
        desc: "Shows the current value of a mod's config option",
        help: [
          'Format: {cmd} <modID>.<configKey>',
          'Example:',
          '  /msg {nick} {cmd} somelogger.mysqlPort',
          '  {!}{cmd} changreeter.greeting'
        ],
        pattern: /^([a-zA-Z0-9_\-]+)\.([a-zA-Z0-9_]+)$/,
        minPermission: 'S'
      }
    },
    setConfig: setConfig
  };
};
