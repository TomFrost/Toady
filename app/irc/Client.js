/*
 * Toady
 * Copyright (c) 2013 Tom Frost
 */

// Dependencies
var config = require('config'),
	irc = require('irc');

var client = new irc.Client(
	config.server.host,
	config.identity.nick,
	{
		userName: config.identity.user,
		realName: config.identity.name,
		port: config.server.port || 6667,
		password: config.server.password || null,
		debug: true,
		showErrors: true,
		autoRejoin: true,
		autoConnect: false,
		channels: config.server.channels || [],
		secure: config.server.ssl || false,
		selfSigned: true,
		certExpired: true,
		floodProtection: !!config.server.floodDelay,
		floodProtectionDelay: config.server.floodDelay,
		stripColors: true,
		channelPrefixes: "&#",
		messageSplit: config.server.messageLength || 512
	});

module.exports = client;
