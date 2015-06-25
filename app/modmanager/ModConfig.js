/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

// Dependencies
var _ = require('lodash');
var config = require('config');
var env = process.env.NODE_ENV || 'default';
var fs = require('fs');
var path = require('path');

const CONFIG_PATH = path.join(__dirname, '../../config/',
  env + '-mod_{mod}.json');
const CONFIG_PREFIX = 'mod_';

/**
 * Gets a path to save a config file specific to a mod.
 * @param {string} modId The mod ID to associate with the file
 * @returns {string} A path appropriate for a config file for this mod ID
 */
function getPath(modId) {
  return CONFIG_PATH.replace('{mod}', modId);
}

/**
 * Gets a closure that will JSON stringify any enumerable properties on 'this'
 * and save it to a file unique to the given modId when called.
 * @param {string} modId The modId for which to generate the closure.  This
 *      determines the filename to which the JSON will be saved.
 * @returns {Function} A closure which, when called, will save the enumerable
 *   local properties of 'this' as JSON to a file.  Argument is:
 *     - {Array<string>} OPTIONAL: An array of top-level properties to save. If
 *       omitted, every enumerable property will be saved.
 *   The function will return a Promise that resolves on complete.
 */
var getSaveFunc = function(modId) {
  return function(props) {
    var serialize = this;
    if (props) {
      serialize = {};
      props.forEach(function(key) {
        if (this.hasOwnProperty(key)) {
          serialize[key] = this[key];
        }
      }, this);
    }
    return new Promise(function(resolve, reject) {
      fs.writeFile(getPath(modId), JSON.stringify(serialize, null, '\t'),
        function(err) {
          if (err) reject(err);
          else resolve();
        });
    });
  };
};

/**
 * Gets an object containing configuration values for a given mod, as well
 * as a non-enumerable non-writable function called "save" that will persist
 * any runtime changes to this config to a file.
 *
 * The configuration object is created in the following fashion:
 *   1: Start with any properties passed in with the 'defaults' argument.
 *      Note that, when writing a Toady mod, this will be whatever has
 *      been set to module.exports.configDefault (if anything)
 *   2: Deep-merge that with any values set in the mod_MODID section of the
 *      default.yaml file (or, for multiple server configs, the SERVER.yaml
 *      file).  Conflicting properties will be overwritten.
 *   3: Deep-merge that with any properties that have been set using
 *      config.save() (where 'config' is the object returned in the
 *      callback of this function).  Conflicting properties will be
 *      overridden
 *
 * Using the returned config object is very straightforward. Just add whatever
 * you like:
 *
 *   config.foo = "bar";
 *   config.hello = {world: "!"};
 *
 * and save it!
 *
 *   config.save();
 *   // OR:
 *   config.save().then(function() {
 *     console.log('Saved!');
 *   }).catch(function(err) {
 *     console.log('Error:', err);
 *   });
 *   // OR:
 *   config.save([prop1, prop2, prop4]);
 *
 * Anything saved will still exist when the bot is restarted or the module
 * is reloaded, thanks to step 3 above.
 *
 * Note that calling this function consecutive times with the same
 * modId/defaults will NOT return the same config object, and is not an
 * appropriate method for changing the config for a mod from a different mod.
 * If that functionality is necessary, it's strongly recommended to access the
 * 'config' property of a mod to read its values, but change those values only
 * with the Config mod's setConfig() function.
 *
 * In the Toady framework, the config object returned by this function is
 * passed directly to each mod when the mod is loaded.
 * @param {string} modId The mod ID whose configuration should be loaded
 * @param {Object|null} defaults An object containing default properties
 *      to be set if neither the bot config or the mod config file has
 *      those properties set.
 * @returns {Promise<Object>} Resolves with the config object, augmented with a
 *    non-enumerable save function.
 */
function getConfig(modId, defaults) {
  var conf = _.merge({}, defaults || {},
    config[CONFIG_PREFIX + modId] || {});
  return getModConfigFile(modId).then(function(modFile) {
    conf = _.merge({}, conf, modFile);
    Object.defineProperty(conf, 'save', {
      value: getSaveFunc(modId).bind(conf)
    });
    return conf;
  });
}

/**
 * Gets the contents of the mod's JSON-formatted config file, parses it, and
 * returns it in a callback.  If the config file does not (yet) exist, an
 * empty object will be passed back instead.
 *
 * Note that, unlike {@link #getConfig}, the object produced by this function
 * will NOT be merged from any other config source and will NOT contain a
 * save() function to persist changes.  The contents of the mod config file
 * will be only what the mod itself was responsible for saving manually.
 * @param {string} modId The ID of the mod whose file should be loaded
 * @returns {Promise<Object>} Resolves with the parsed config object
 */
function getModConfigFile(modId) {
  return new Promise(function(resolve, reject) {
    fs.readFile(getPath(modId), function(err, json) {
      if (err && err.code !== 'ENOENT') {
        reject(err);
      } else {
        var savedConf = {};
        if (json) {
          savedConf = JSON.parse(json);
        }
        resolve(savedConf || {});
      }
    });
  });
}

module.exports = {
  CONFIG_PATH: CONFIG_PATH,
  CONFIG_PREFIX: CONFIG_PREFIX,
  getConfig: getConfig,
  getModConfigFile: getModConfigFile
};
