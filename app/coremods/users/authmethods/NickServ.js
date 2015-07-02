/*
 * Toady
 * Copyright 2015 Tom Shawver
 */

const NICKSERV = 'NickServ';
const REQ_TIMEOUT = 10000;
const SWITCH_REGEX = /^Unknown command/;
const TYPES = {
  // The 'ACC' command is used by Atheme's NickServ
  ACC: {
    cmd: 'ACC {nick}',
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
  var pendingNicks = {};
  var type = 'ACC';
  var locked = false;

  function handleNotice(from, to, text) {
    if (!locked && text.match(SWITCH_REGEX)) {
      type = 'STATUS';
      locked = true;
      Object.keys(pendingNicks).forEach(sendCommand);
    } else if (from && from.toLowerCase() === NICKSERV.toLowerCase()) {
      var res = text.match(TYPES[type].regex);
      if (res) {
        res[1] = res[1].toLowerCase();
        if (pendingNicks[res[1]]) {
          locked = true;
          pendingNicks[res[1]].resolve(res[2] === TYPES[type].success);
          clearTimeout(pendingNicks.timeout);
          delete pendingNicks[res[1]];
        }
      }
    }
  }
  client.on('notice', handleNotice);

  function isAuthorized(nick) {
    nick = nick.toLowerCase();
    return new Promise(function(resolve, reject) {
      pendingNicks[nick] = {
        resolve: resolve,
        timeout: setTimeout(function() {
          delete pendingNicks[nick];
          reject(new Error('NickServ authentication timed out'));
        }, REQ_TIMEOUT)
      };
      sendCommand(nick);
    });
  }

  function sendCommand(nick) {
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
