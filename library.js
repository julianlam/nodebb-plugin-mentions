'use strict';

var	async = require('async');
var winston = module.parent.require('winston');
var XRegExp = require('xregexp');
var validator = require('validator');
var nconf = module.parent.require('nconf');

var db = require.main.require('./src/database');
var Topics = require.main.require('./src/topics');
var User = require.main.require('./src/user');
var Posts = require.main.require('./src/posts');
var Groups = require.main.require('./src/groups');
var Notifications = require.main.require('./src/notifications');
var Privileges = require.main.require('./src/privileges');
var Meta = require.main.require('./src/meta');
var Utils = require.main.require('./src/utils');
var batch = require.main.require('./src/batch');

var SocketPlugins = require.main.require('./src/socket.io/plugins');

const utility = require('./lib/utility');

var regex = XRegExp('(?:^|\\s|\\>|;)(@[\\p{L}\\d\\-_.]+)', 'g');
var isLatinMention = /@[\w\d\-_.]+$/;
var removePunctuationSuffix = function(string) {
	return string.replace(/[!?.]*$/, '');
};
var Entities = require('html-entities').XmlEntities;
var entities = new Entities();

var Mentions = {
	_settings: {},
	_defaults: {
		disableFollowedTopics: 'off',
		autofillGroups: 'off',
		disableGroupMentions: '[]',
		overrideIgnores: 'off',
		display: '',
	}
};
SocketPlugins.mentions = {};

Mentions.init = function (data, callback) {
	var hostMiddleware = require.main.require('./src/middleware');
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

function getNoMentionGroups() {
	var noMentionGroups = ['registered-users', 'guests'];
	try {
		noMentionGroups = noMentionGroups.concat(JSON.parse(Mentions._settings.disableGroupMentions));
	} catch (err) {
		winston.error(err);
	}
	return noMentionGroups;
}

Mentions.notify = function(data) {
	var postData = data.post;
	var cleanedContent = Mentions.clean(postData.content, true, true, true);
	var matches = cleanedContent.match(regex);

	if (!matches) {
		return;
	}

	var noMentionGroups = getNoMentionGroups();

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
				if (Mentions._settings.disableFollowedTopics === 'on') {
					Topics.getFollowers(postData.tid, next);
				} else {
					next(null, []);
				}
			}
		}, function(err, results) {
			if (err) {
				return;
			}

			var title = entities.decode(results.topic.title);
			var titleEscaped = title.replace(/%/g, '&#37;').replace(/,/g, '&#44;');

			var uids = results.uids.filter(function(uid, index, array) {
				return array.indexOf(uid) === index && parseInt(uid, 10) !== parseInt(postData.uid, 10) && !results.topicFollowers.includes(uid.toString());
			});

			var groupMemberUids = {};
			results.groupData.groupNames.forEach(function(groupName, index) {
				results.groupData.groupMembers[index] = results.groupData.groupMembers[index].filter(function(uid) {
					if (!uid || groupMemberUids[uid]) {
						return false;
					}
					groupMemberUids[uid] = 1;
					return !uids.includes(uid) &&
						parseInt(uid, 10) !== parseInt(postData.uid, 10) &&
						!results.topicFollowers.includes(uid.toString());
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

function sendNotificationToUids(postData, uids, nidType, notificationText) {
	if (!uids.length) {
		return;
	}

	var filteredUids = [];
	var notification;
	async.waterfall([
		function (next) {
			Posts.parsePost(postData)
				.then((parsedPost => next(null, parsedPost)))
				.catch(next);
		},
		function (postObject, next) {
			postObject.content = Posts.relativeToAbsolute(postObject.content, Posts.urlRegex);
			postObject.content = Posts.relativeToAbsolute(postObject.content, Posts.imgRegex);
			createNotification(postObject, nidType, notificationText, next);
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
						if (Mentions._settings.overrideIgnores === 'on') {
							return setImmediate(next, null, _uids);
						}

						Topics.filterIgnoringUids(postData.tid, _uids, next);
					},
					function (_uids, next) {
						// Filter out uids that have already been notified for this pid
						db.isSortedSetMembers('mentions:sent:' + postData.pid, _uids, function (err, exists) {
							next(err, _uids.filter((uid, idx) => !exists[idx]))
						});
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

		if (notification && filteredUids.length) {
			Notifications.push(notification, filteredUids, function () {
				const dates = filteredUids.map(() => Date.now());
				db.sortedSetAdd('mentions:sent:' + postData.pid, dates, filteredUids);
			});
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
	var splitContent = utility.split(content, false, false, true);
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
			user: async () => {
				const uid = await User.getUidByUserslug(slug);
				return await User.getUserFields(uid, ['uid', 'username', 'fullname']);
			},
		}, function(err, results) {
			if (err) {
				return next(err);
			}

			if (results.user.uid || results.groupExists) {
				var regex = isLatinMention.test(match)
					? new RegExp('(?:^|\\s|\>|;)' + match + '\\b', 'g')
					: new RegExp('(?:^|\\s|\>|;)' + match, 'g');

				let skip = false;

				splitContent = splitContent.map(function(c, i) {
					// *Might* not be needed anymore? Check pls...
					if (skip || (i & 1) === 1) {
						skip = c === '<code>';	// if code block detected, skip the content inside of it
						return c;
					}
					return c.replace(regex, function(match) {
						// Again, cleaning up lookaround leftover bits
						var atIndex = match.indexOf('@');
						var plain = match.slice(0, atIndex);
						match = match.slice(atIndex);
						if (results.user.uid) {
							switch (Mentions._settings.display) {
								case 'fullname':
									match = results.user.fullname || match;
									break;
								case 'username':
									match = results.user.username;
									break;
							}
						}

						var str = results.user.uid
								? '<a class="plugin-mentions-user plugin-mentions-a" href="' + nconf.get('url') + '/uid/' + results.user.uid + '">' + match + '</a>'
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
	var split = utility.split(input, isMarkdown, stripBlockquote, stripCode);
	split = split.filter(function(e, i) {
		// only keep non-code/non-blockquote
		return (i & 1) === 0;
	});
	return split.join('');
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
		var noMentionGroups = getNoMentionGroups();
		groups = groups.filter(function(groupName) {
			return groupName && !noMentionGroups.includes(groupName);
		}).map(function(groupName) {
			return validator.escape(groupName);
		});
		callback(null, groups);
	});
};

module.exports = Mentions;
