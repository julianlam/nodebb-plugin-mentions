'use strict';

var	async = require('async');
var winston = module.parent.require('winston');
var XRegExp = require('xregexp');
var validator = require('validator');
var nconf = module.parent.require('nconf');

var Topics = module.parent.require('./topics');
var User = module.parent.require('./user');
var Groups = module.parent.require('./groups');
var Notifications = module.parent.require('./notifications');
var Privileges = module.parent.require('./privileges');
var Meta = module.parent.require('./meta');
var Utils = module.parent.require('../public/src/utils');
var batch = module.parent.require('./batch');

var SocketPlugins = module.parent.require('./socket.io/plugins');

var regex = XRegExp('(?:^|\\s)(@[\\p{L}\\d\\-_.]+)', 'g');	// used in post text transform, accounts for HTML
var rawRegex = XRegExp('(?:^|\\s)(@[\\p{L}\\d\-_.]+)', 'g');	// used in notifications, as raw text is passed in this hook
var isLatinMention = /@[\w\d\-_.]+$/;
var removePunctuationSuffix = function(string) {
	return string.replace(/[!?.]*$/, '');
};
var Entities = require('html-entities').XmlEntities;
var entities = new Entities();

var Mentions = {
	_settings: {},
	_defaults: {
		autofillGroups: 'off',
	}
};
SocketPlugins.mentions = {};

Mentions.init = function (data, callback) {
	var hostMiddleware = module.parent.require('./middleware');
	var controllers = require('./controllers');

	data.router.get('/admin/plugins/mentions', hostMiddleware.admin.buildHeader, controllers.renderAdminPage);
	data.router.get('/api/admin/plugins/mentions', controllers.renderAdminPage);

	// Retrieve settings
	Meta.settings.get('mentions', function (err, settings) {
		Object.assign(Mentions._settings, Mentions._defaults, settings);
		callback();
	});
};

Mentions.addAdminNavigation = function (header, callback) {
	header.plugins.push({
		route: '/plugins/mentions',
		name: 'Mentions'
	});

	callback(null, header);
};

Mentions.notify = function(data) {
	var postData = data.post;
	var cleanedContent = Mentions.clean(postData.content, true, true, true);
	var matches = cleanedContent.match(rawRegex);

	if (!matches) {
		return;
	}

	var noMentionGroups = ['registered-users', 'guests'];

	matches = matches.map(function(match) {
		return Utils.slugify(match);
	}).filter(function(match, index, array) {
		return match && array.indexOf(match) === index && noMentionGroups.indexOf(match) === -1;
	});

	if (!matches.length) {
		return;
	}

	async.parallel({
		userRecipients: function(next) {
			async.filter(matches, User.existsBySlug, next);
		},
		groupRecipients: function(next) {
			async.filter(matches, Groups.existsBySlug, next);
		}
	}, function(err, results) {
		if (err) {
			return;
		}

		if (!results.userRecipients.length && !results.groupRecipients.length) {
			return;
		}

		async.parallel({
			topic: function(next) {
				Topics.getTopicFields(postData.tid, ['title', 'cid'], next);
			},
			author: function(next) {
				User.getUserField(postData.uid, 'username', next);
			},
			uids: function(next) {
				async.map(results.userRecipients, function(slug, next) {
					User.getUidByUserslug(slug, next);
				}, next);
			},
			groupData: function(next) {
				getGroupMemberUids(results.groupRecipients, next);
			},
			topicFollowers: function(next) {
				Topics.getFollowers(postData.tid, next);
			}
		}, function(err, results) {
			if (err) {
				return;
			}

			var title = entities.decode(results.topic.title);
			var titleEscaped = title.replace(/%/g, '&#37;').replace(/,/g, '&#44;');

			var uids = results.uids.filter(function(uid, index, array) {
				return array.indexOf(uid) === index && parseInt(uid, 10) !== parseInt(postData.uid, 10) && results.topicFollowers.indexOf(uid.toString()) === -1;
			});

			var groupMemberUids = {};
			results.groupData.groupNames.forEach(function(groupName, index) {
				results.groupData.groupMembers[index] = results.groupData.groupMembers[index].filter(function(uid) {
					if (!uid || groupMemberUids[uid]) {
						return false;
					}
					groupMemberUids[uid] = 1;
					return uids.indexOf(uid) === -1 &&
						parseInt(uid, 10) !== parseInt(postData.uid, 10) &&
						results.topicFollowers.indexOf(uid.toString()) === -1;
				});
			});

			sendNotificationToUids(postData, uids, 'user', '[[notifications:user_mentioned_you_in, ' + results.author + ', ' + titleEscaped + ']]');

			results.groupData.groupNames.forEach(function(groupName, index) {
				var memberUids = results.groupData.groupMembers[index];
				sendNotificationToUids(postData, memberUids, groupName, '[[notifications:user_mentioned_group_in, ' + results.author + ', ' + groupName + ', ' + titleEscaped + ']]');
			});
		});
	});
};

Mentions.addFilters = function (data, callback) {
	data.regularFilters.push({ name: '[[notifications:mentions]]', filter: 'mention' });
	callback(null, data);
};

Mentions.notificationTypes = function (data, callback) {
	data.types.push('notificationType_mention');
	callback(null, data);
};

Mentions.filterUserSaveSettings = function (hookData, callback) {
	hookData.settings.notificationType_mention = hookData.data.notificationType_mention;
	callback(null, hookData);
};

function sendNotificationToUids(postData, uids, nidType, notificationText) {
	if (!uids.length) {
		return;
	}

	var filteredUids = [];
	var notification;
	async.waterfall([
		function (next) {
			createNotification(postData, nidType, notificationText, next);
		},
		function (_notification, next) {
			notification = _notification;
			if (!notification) {
				return next();
			}

			batch.processArray(uids, function (uids, next) {
				async.waterfall([
					function(next) {
						Privileges.topics.filterUids('read', postData.tid, uids, next);
					},
					function(_uids, next) {
						Topics.filterIgnoringUids(postData.tid, _uids, next);
					},
					function(_uids, next) {
						if (!_uids.length) {
							return next();
						}

						filteredUids = filteredUids.concat(_uids);

						next();
					}
				], next);
			}, {
				interval: 1000,
				batch: 500,
			}, next);
		},
	], function (err) {
		if (err) {
			return winston.error(err);
		}
		if (notification) {
			Notifications.push(notification, filteredUids);
		}
	});
}

function createNotification(postData, nidType, notificationText, callback) {
	Notifications.create({
		type: 'mention',
		bodyShort: notificationText,
		bodyLong: postData.content,
		nid: 'tid:' + postData.tid + ':pid:' + postData.pid + ':uid:' + postData.uid + ':' + nidType,
		pid: postData.pid,
		tid: postData.tid,
		from: postData.uid,
		path: '/post/' + postData.pid,
		importance: 6
	}, callback);
}

function getGroupMemberUids(groupRecipients, callback) {
	async.map(groupRecipients, function(slug, next) {
		Groups.getGroupNameByGroupSlug(slug, next);
	}, function(err, groupNames) {
		if (err) {
			return callback(err);
		}
		async.map(groupNames, function(groupName, next) {
			Groups.getMembers(groupName, 0, -1, next);
		}, function(err, groupMembers) {
			if (err) {
				return callback(err);
			}
			callback(null, {groupNames: groupNames, groupMembers: groupMembers});
		});
	});
}

Mentions.parsePost = function(data, callback) {
	if (!data || !data.postData || !data.postData.content) {
		return callback(null, data);
	}

	Mentions.parseRaw(data.postData.content, function(err, content) {
		if (err) {
			return callback(err);
		}

		data.postData.content = content;
		callback(null, data);
	});
};

Mentions.parseRaw = function(content, callback) {
	var splitContent = Mentions.split(content, false, false, true);
	var matches = [];
	splitContent.forEach(function(cleanedContent, i) {
		if ((i & 1) === 0) {
			matches = matches.concat(cleanedContent.match(regex) || []);
		}
	});

	if (!matches.length) {
		return callback(null, content);
	}

	matches = matches.filter(function(cur, idx) {
		// Eliminate duplicates
		return idx === matches.indexOf(cur);
	}).map(function(match) {
		/**
		 *	Javascript-favour of regex does not support lookaround,
		 *	so need to clean up the cruft by discarding everthing
		 *	before the @
		 */
		var atIndex = match.indexOf('@');
		return atIndex !== 0 ? match.slice(atIndex) : match;
	});

	async.each(matches, function(match, next) {
		var slug = Utils.slugify(match.slice(1));

		match = removePunctuationSuffix(match);

		async.parallel({
			groupExists: async.apply(Groups.existsBySlug, slug),
			uid: async.apply(User.getUidByUserslug, slug)
		}, function(err, results) {
			if (err) {
				return next(err);
			}

			if (results.uid || results.groupExists) {
				var regex = isLatinMention.test(match)
					? new RegExp('(?:^|\\s)' + match + '\\b', 'g')
					: new RegExp('(?:^|\\s)' + match, 'g');

				splitContent = splitContent.map(function(c, i) {
					if ((i & 1) === 1) {
						return c;
					}
					return c.replace(regex, function(match) {
						// Again, cleaning up lookaround leftover bits
						var atIndex = match.indexOf('@');
						var plain = match.slice(0, atIndex);
						match = match.slice(atIndex);
						var str = results.uid
								? '<a class="plugin-mentions-user plugin-mentions-a" href="' + nconf.get('url') + '/uid/' + results.uid + '">' + match + '</a>'
								: '<a class="plugin-mentions-group plugin-mentions-a" href="' + nconf.get('url') + '/groups/' + slug + '">' + match + '</a>';

						return plain + str;
					});
				});
			}

			next();
		});
	}, function(err) {
		callback(err, splitContent.join(''));
	});
};

Mentions.clean = function(input, isMarkdown, stripBlockquote, stripCode) {
	var split = Mentions.split(input, isMarkdown, stripBlockquote, stripCode);
	split = split.filter(function(e, i) {
		// only keep non-code/non-blockquote
		return (i & 1) === 0;
	});
	return split.join('');
};

Mentions.split = function(input, isMarkdown, splitBlockquote, splitCode) {
	if (!input) {
		return [];
	}

	var matchers = [isMarkdown ? '\\[.*?\\]\\(.*?\\)' : '<a[\\s\\S]*?</a>|<[^>]+>'];
	if (splitBlockquote) {
		matchers.push(isMarkdown ? '^>.*$' : '^<blockquote>.*?</blockquote>');
	}
	if (splitCode) {
		matchers.push(isMarkdown ? '`[^`\n]+`' : '<code[\\s\\S]*?</code>');
	}
	return input.split(new RegExp('(' + matchers.join('|') + ')', 'gm'));
};

/*
	WebSocket methods
*/

SocketPlugins.mentions.listGroups = function(socket, data, callback) {
	if (Mentions._settings.autofillGroups === 'off') {
		return callback(null, []);
	}

	Groups.getGroups('groups:visible:createtime', 0, -1, function(err, groups) {
		if (err) {
			return callback(err);
		}
		groups = groups.filter(Boolean).map(function(groupName) {
			return validator.escape(groupName);
		});
		callback(null, groups);
	});
};

module.exports = Mentions;
