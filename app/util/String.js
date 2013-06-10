/*
 * Toady
 * Copyright 2013 Tom Frost
 */

/**
 * Makes a string fit the specified space, either by right-padding it with
 * spaces or by truncating it.
 *
 * @param {String} str The string whose length should be changed
 * @param {Number} len The new length of the string
 * @param {boolean} [truncOnly] true if this function should only truncate
 *      the string, and never pad it; false otherwise.  This is useful
 *      to avoid unnecessary padding on the last string of a line.
 * @returns {String} The string, with a length matching the len argument.
 */
function fit(str, len, truncOnly) {
	if (!truncOnly) {
		while (str.length < len)
			str += ' ';
	}
	if (str.length > len)
		str = str.substring(0, len);
	return str;
}

/**
 * Scans an array of strings for the longest string length it contains.
 *
 * @param {Array} ary An array of strings
 * @returns {Number} The largest string length in the array
 */
function maxLen(ary) {
	var maxLen = 0;
	ary.forEach(function(str) {
		if (str.length > maxLen)
			maxLen = str.length;
	});
	return maxLen;
}

module.exports = {
	fit: fit,
	maxLen: maxLen
};
