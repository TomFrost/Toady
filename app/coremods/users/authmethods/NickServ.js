/*
 * Toady
 * Copyright 2013 Tom Frost
 */

// Dependencies
var objUtil = require('../../../util/Object');

const NICKSERV = 'NickServ';
const SWITCH_REGEX = /^Unknown command/;
const TYPES = {
	// The 'ACC' command is used by Atheme's NickServ
	ACC: {
		cmd: 'ACC {nick} *',
		regex: /(?:^|\s)(\S+) ACC (\d)/,
		success: 3
	},
	// The 'STATUS' command is used by Anope's NickServ
	STATUS: {
		cmd: 'STATUS {nick}',
		regex: /^STATUS (\S+) (\d)$/,
		success: 3
	}
};

module.exports = function(config, client) {

	var pendingNicks = {},
		type = 'ACC',
		locked = false;

	function handleNotice(from, to, text, message) {
		if (!locked && text.match(SWITCH_REGEX)) {
			type = 'STATUS';
			locked = true;
			objUtil.forEach(pendingNicks, function(nick, cb) {
				isAuthorized(nick, null, cb);
			});
		}
		else if (from && from.toLowerCase() == NICKSERV.toLowerCase()) {
			var res = text.match(TYPES[type].regex);
			if (res) {
				res[1] = res[1].toLowerCase();
				if (pendingNicks[res[1]]) {
					locked = true;
					pendingNicks[res[1]](null, res[2] == TYPES[type].success);
					delete pendingNicks[res[1]];
				}
			}
		}
	}
	client.on('notice', handleNotice);

	function isAuthorized(nick, opts, cb) {
		nick = nick.toLowerCase();
		pendingNicks[nick] = cb;
		var cmd = TYPES[type].cmd.replace('{nick}', nick);
		client.say(NICKSERV, cmd);
	}

	return {
		isAuthorized: isAuthorized,
		unload: function() {
			client.removeListener('notice', handleNotice);
		}
	};
};
