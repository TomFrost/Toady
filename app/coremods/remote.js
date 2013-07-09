/*
 * Toady
 * Copyright 2013 Tom Frost
 */

/**
 * Remote allows basic IRC functions to be executed, such as speaking or
 * joining channels.
 *
 * @param {Object} config A Toady config object
 * @param {Object} client An IRC client object
 * @param {Object} modMan The Toady ModManager object
 * @returns {Object} A Toady mod
 */
module.exports = function(config, client, modMan) {
	return {
		name: 'Remote Control',
		desc: "Allows for remote execution of the IRC client's primary \
functions",
		author: 'Tom Frost',
		commands: {
			me: {
				handler: function(from, to, target, args) {
					client.action(target, args[0]);
				},
				desc: "Makes the bot emote something in a channel, a la /me",
				help: [
					"Format: {cmd} [#channel] <some message>",
					"Examples:",
					"  /msg {nick} {cmd} #room bows",
					"  {!}{cmd} is repeating things",
					"  {!}{cmd} #otherRoom pokes his head in",
					" ",
					"If this is said in a channel, I'll repeat it to the same \
room if no other channel is specified."
				],
				targetChannel: true,
				minPermission: '+',
				pattern: /^.+$/
			},
			say: {
				handler: function(from, to, target, args) {
					client.say(target, args[0]);
				},
				desc: "Makes the bot say something in a channel",
				help: [
					"Format: {cmd} [#channel] <some message>",
					"Examples:",
					"  /msg {nick} {cmd} #room Hey ya'll",
					"  {!}{cmd} Echo...",
					"  {!}{cmd} #otherRoom Hey peeps",
					" ",
					"If this is said in a channel, I'll repeat it to the same \
room if no other channel is specified."
				],
				targetChannel: true,
				minPermission: '+',
				pattern: /^.+$/
			},
			msg: {
				handler: function(from, to, target, args) {
					client.say(target, args[0]);
				},
				desc: "Sends a direct message to a given nick",
				help: [
					"Format: {cmd} <nick> <some message>",
					"Examples:",
					"  /msg {nick} {cmd} Bob Hey bob.",
					"  {!}{cmd} Mom What's for dinner?"
				],
				targetNick: true,
				minPermission: 'P',
				pattern: /^.+$/
			},
			nick: {
				handler: function(from, to, target, args) {
					client.send('NICK', args[1]);
				},
				desc: "Changes the nickname of the bot",
				help: [
					"Format: {cmd} <nick>",
					"Example:",
					"  /msg {nick} {cmd} Bender"
				],
				minPermission: 'P',
				pattern: /^(\S+)$/
			},
			join: {
				handler: function(from, to, target, args) {
					client.join(target);
				},
				desc: "Joins a new channel",
				help: [
					"Format: {cmd} <#channel>",
					"Example:",
					"  /msg {nick} {cmd} #goatsrule"
				],
				minPermission: '@',
				targetChannel: true
			},
			part: {
				handler: function(from, to, target, args) {
					client.part(target);
				},
				desc: "Leaves a channel",
				help: [
					"Format: {cmd} [#channel]",
					"Example:",
					"  /msg {nick} {cmd} #goatssuck",
					"  !{cmd}",
					"If the channel is omitted and the message was said in \
the channel, the bot will leave that channel."
				],
				minPermission: '@',
				targetChannel: true
			}
		}
	};
};
