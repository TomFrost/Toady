/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

// Dependencies
var Bluebird = require('bluebird');
var fs = require('fs');
var npm = require('npm');
var path = require('path');
var rimraf = Bluebird.promisify(require('rimraf'));

const MOD_DIR = path.normalize(path.join(__dirname, '../../mods'));
const MOD_PREFIX = 'toady-';

Bluebird.promisifyAll(fs);
Bluebird.promisifyAll(npm);

/**
 * Installs a given Toady mod by having NPM install it into node_modules
 * (complete with the 'toady-' prefix) and symlinking it to the mods folder
 * without the prefix.
 * @param {string} modId The ID of the mod to be installed, without the
 *    Toady package prefix
 * @returns {Promise} Resolves on complete.
 */
function install(modId) {
  var modPkg = MOD_PREFIX + modId;
  return Promise.resolve().then(function() {
    if (modId.indexOf(' ') !== -1) {
      throw new Error('Mod names cannot contain spaces');
    }
    return npm.loadAsync();
  }).then(function(npmInst) {
    return npmInst.installAsync(modPkg);
  }).then(function() {
    return fs.symlinkAsync(path.join(npm.dir, modPkg),
      path.join(MOD_DIR, modId), 'dir');
  });
}

/**
 * Executes an NPM search for mods matching the toady mod prefix and an
 * optional additional search query.
 * @param {string|null} [query] A search query to limit the result.  Omit to
 *    return all Toady mods.
 * @returns {Promise<{modIds: Array<string>, res: Object}>} Resolves with an
 *    object containing two properties: an array of modIds found (modIds), and
 *    the raw NPM response object (res). Note that not all results in this set
 *    may be Toady mods. It's best to iterate through the array of modIds,
 *    prepending {@link #MOD_PREFIX} to each one, and pulling that key from
 *    this object.
 */
function search(query) {
  return npm.loadAsync().then(function(npmInst) {
    var args = query.split(' ');
    args.push(MOD_PREFIX);
    return npmInst.searchAsync.apply(npmInst, args);
  }).then(function(res) {
    var pregex = new RegExp('^' + MOD_PREFIX);
    var modIds = Object.keys(res).filter(function(key) {
      return key.match(pregex);
    }).map(function(key) {
      return key.substr(MOD_PREFIX.length);
    });
    if (!modIds || !modIds.length) {
      throw new Error('No results for "' + query + '".');
    }
    return {
      modIds: modIds,
      res: res
    };
  });
}

/**
 * Uninstalls a mod by removing the symlink in the mods folder, as well as
 * deleting the mod from node_modules.  If a mod was not installed through
 * this means, an error will be returned.
 * @param {string} modId An installed mod ID to be deleted
 * @returns {Promise} Resolves on complete.
 */
function uninstall(modId) {
  var modPath = path.join(MOD_DIR, modId);
  var nonRibbitErr = new Error('Only mods installed with this utility ' +
    'can be uninstalled with this utility.');
  return Promise.resolve().then(function() {
    if (modId.indexOf(' ') !== -1 || modId.indexOf('/') !== -1) {
      throw new Error('The uninstall command takes a single mod ID.');
    }
    return new Promise(function(resolve, reject) {
      fs.lstat(modPath, function(err, stat) {
        if (err) {
          if (err.code === 'ENOENT') {
            reject(new Error("Mod '" + modId + "' not found."));
          } else {
            reject(err);
          }
        } else {
          resolve(stat);
        }
      });
    });
  }).then(function(stat) {
    if (!stat.isSymbolicLink()) {
      throw nonRibbitErr;
    }
    return fs.readlinkAsync(modPath);
  }).then(function(linkPath) {
    var existsRegex = new RegExp(path.join('node_modules',
        MOD_PREFIX + modId) + '$');
    if (!linkPath.match(existsRegex)) {
      throw nonRibbitErr;
    }
    return Promise.all([
      fs.unlinkAsync(modPath),
      rimraf(linkPath)
    ]);
  });
}

module.exports = {
  MOD_DIR: MOD_DIR,
  MOD_PREFIX: MOD_PREFIX,
  install: install,
  search: search,
  uninstall: uninstall
};
