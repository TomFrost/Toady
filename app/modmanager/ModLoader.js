/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

// Dependencies
var fs = require('fs');
var path = require('path');
var Ribbit = require('../ribbit/Ribbit');

const CORE_MOD_DIR = path.join(__dirname, '../coremods');
const USER_MOD_DIR = path.join(__dirname, '../../mods');

var coreModIds;
var coreModIdMap;

/**
 * Converts an array to an object map, using the array values as keys and
 * setting the values to boolean true.  This is useful for speeding up
 * repeated checks for existing values in an array.
 * @param {Array<string>} ary The array to be converted
 * @returns {Object} The hash map
 */
function arrayToMap(ary) {
  var map = {};
  ary.forEach(function(elem) {
    map[elem] = true;
  });
  return map;
}

/**
 * Retrieves an object map, with the keys being all available mod IDs in the
 * 'coremods' folder, and each value being boolean true.
 * @returns {Promise<Object>} Resolves with the hash map
 */
function getCoreModIdMap() {
  if (coreModIds) {
    if (!coreModIdMap) {
      coreModIdMap = arrayToMap(coreModIds);
    }
    return Promise.resolve(coreModIdMap);
  }
  return getCoreModIds().then(function(ids) {
    coreModIdMap = arrayToMap(ids);
    return coreModIdMap;
  });
}

/**
 * Gets an array of all available mod IDs in the 'coremods' folder.
 * @returns {Promise<Array<string>>} Resolves with the array of mod IDs.
 */
function getCoreModIds() {
  if (coreModIds) {
    return Promise.resolve(coreModIds);
  }
  return getModIdsInDir(CORE_MOD_DIR).then(function(ids) {
    coreModIds = ids;
    return ids;
  });
}

/**
 * Gets an array of all available mod IDs in a given directory.
 * @param {string} dir The path to the folder to be checked
 * @returns {Promise<Array<string>>} the array of mod IDs.
 */
function getModIdsInDir(dir) {
  return new Promise(function(resolve, reject) {
    fs.readdir(dir, function(err, list) {
      if (err) {
        reject(err);
      } else {
        var modIds = list.filter(function(file) {
          return file[0] !== '.';
        }).map(function(file) {
          return file.replace(/\.js$/, '');
        });
        resolve(modIds);
      }
    });
  });
}

/**
 * Gets an array of all available mod IDs in the 'mods' folder.
 * @returns {Promise<Array<string>>} the array of mod IDs.
 */
function getUserModIds() {
  return getModIdsInDir(USER_MOD_DIR);
}

/**
 * Loads a mod by its mod ID, only to the extent of resolving its file name
 * and requiring it.  If the ID is found in the coremods folder (according to
 * a snapshot taken of this folder at start time), it will be loaded from
 * there.  Otherwise, it will attempt to load the mod from the 'mods' folder.
 *
 * Note that loading modules into the Toady framework is significantly more
 * complex than calling this function; this should only be called from
 * {@link ModManager#loadMod}.
 * @param {string} modId The ID of the mod to be loaded
 * @returns {Promise<{func: function, [json]: Object}>} Resolves with an object
 *    containing the loaded module (func) as well as the parsed package.json
 *    file (json) if found.
 * @throws {Error} If the module does not exist
 */
function loadMod(modId) {
  var dir;
  getCoreModIdMap().then(function(coreModMap) {
    dir = coreModMap[modId] ? CORE_MOD_DIR : USER_MOD_DIR;
    try {
      return {func: require(path.join(dir, modId))};
    } catch (e) {
      throw new Error("Could not load mod '" + modId +
        "': Module does not exist");
    }
  }).then(function(pkg) {
    try {
      pkg.json = require(path.join(dir, modId, 'package.json'));
    } catch (e) {
      pkg.json = null;
    }
    return pkg;
  });
}

/**
 * Unloads a mod by its mod ID, only to the extent of removing the mod file
 * and any other files in the mod's folder from the Node.js module cache.
 * This will cause these files to be re-processed and fully loaded if
 * {@link #loadMod} is called for this mod again in the future.
 *
 * Note that unloading modules from the Toady framework is significantly more
 * complex than calling this function; this should only be called from
 * {@link ModManager#unloadMod}.
 * @param {String} modId The ID of the mod to be unloaded.
 * @returns {Promise} Resolves on complete
 */
function unloadMod(modId) {
  return getCoreModIdMap().then(function(coreModMap) {
    var dir = coreModMap[modId] ? CORE_MOD_DIR : USER_MOD_DIR;
    var modKey = require.resolve(dir + '/' + modId);
    if (require.cache[modKey]) {
      var regex = new RegExp('\/(?:' + Ribbit.MOD_PREFIX + ')?' + modId);
      var cacheKeys = Object.keys(require.cache);
      cacheKeys.forEach(function(key) {
        if (key.match(regex)) {
          delete require.cache[key];
        }
      });
    }
  });
}

module.exports = {
  getCoreModIds: getCoreModIds,
  getUserModIds: getUserModIds,
  loadMod: loadMod,
  unloadMod: unloadMod
};
