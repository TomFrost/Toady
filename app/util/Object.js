/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

/**
 * Recursively clones any of the basic javascript data types.
 *
 * @param {*} obj The item to be cloned.
 * @returns {*} The cloned item.
 * @throws {Error} if an unsupported element is encountered.
 */
function clone(obj) {
  if (obj === null || typeof obj != "object") return obj;
  var copy, i, len;
  if (obj instanceof Date) {
    copy = new Date();
    copy.setTime(obj.getTime());
    return copy;
  }
  if (obj instanceof Array) {
    copy = [];
    for (i = 0, len = obj.length; i < len; ++i)
      copy[i] = clone(obj[i]);
    return copy;
  }
  if (obj instanceof Object) {
    copy = {};
    for (var attr in obj)
      if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
    return copy;
  }
  throw new Error("Could not clone; element not supported.");
}

/**
 * Performs a deep merge of two objects.  The given objects will be cloned
 * when necessary to avoid variable reference issues in the returned result.
 *
 * @param {Object} obj1 The first object to be merged.
 * @param {Object} obj2 The second object to be merged.  If this object
 *      contains a field present in obj1, obj1's will be overwritten.
 * @param {Function} [resolveConflict] In the event that a field exists in both
 *      objects, and the field itself is not an object in both, this optional
 *      function can be run to determine the result of the merged field. It is
 *      provided the value from obj1 and the value from obj2 as arguments, and
 *      must return the result to be saved.  If not specified, obj2's value
 *      will always win.
 * @return {Object} The completed, merged object.
 */
function deepMerge(obj1, obj2, resolveConflict) {
  if (!resolveConflict)
    resolveConflict = function(val1, val2) { return val2; };
  var merged = {},
    key;
  for (key in obj2) {
    if (obj2.hasOwnProperty(key)) {
      if (obj1.hasOwnProperty(key)) {
        if (typeof obj2[key] == 'object' &&
          typeof obj1[key] == "object") {
          merged[key] = deepMerge(obj1[key], obj2[key],
            resolveConflict);
        }
        else
          merged[key] = resolveConflict(obj1[key], obj2[key]);
      }
      else
        merged[key] = clone(obj2[key]);
    }
  }
  for (key in obj1) {
    if (obj1.hasOwnProperty(key) && !merged.hasOwnProperty(key))
      merged[key] = clone(obj1[key]);
  }
  return merged;
}

/**
 * Finds an available key within the provided object by appending numbers to
 * the end of the requested key.
 *
 * @param {Object} obj The object in which a free key must be found.
 * @param {String} key The requested key
 * @param {String} separator An optional separator to append to the key before
 *      any numbers, if numbers are necessary to be added.
 * @return {String} The available key.
 */
function findFreeKey(obj, key, separator) {
  var orig = key,
    nextNum = 0;
  if (!separator)
    separator = '';
  while (obj.hasOwnProperty(key))
    key = orig + separator + nextNum++;
  return key;
}

/**
 * Executes a given function once for every key/value pair in the object.  Note
 * that hasOwnProperty will be checked for each key before calling.
 * @param {Object} obj The object to be iterated through
 * @param {Function} cb The callback function to be executed for each key/value
 *    pair.  Arguments provided are:
 *      - {string} The key
 *      - {*} The value
 * @param {Object} [context] An optional context object in which to execute the
 *    callback function
 */
function forEach(obj, cb, context) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      cb.call(context || {}, key, obj[key]);
    }
  }
}

/**
 * Performs a shallow merge of all object arguments.
 *
 * @return {Object} The completed, merged object.
 */
function merge() {
  var obj = {};
  var args = Array.prototype.slice.call(arguments);
  args.forEach(function(elem) {
    if (typeof elem == 'object') {
      for (var i in elem) {
        if (elem.hasOwnProperty(i))
          obj[i] = elem[i];
      }
    }
  });
  return obj;
}

// Public API Mapping
module.exports = {
  clone: clone,
  deepMerge: deepMerge,
  findFreeKey: findFreeKey,
  forEach: forEach,
  merge: merge
};
