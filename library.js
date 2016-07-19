'use strict';

var	async = module.parent.require('async');
var S = module.parent.require('string');
var winston = module.parent.require('winston');
var XRegExp = module.parent.require('xregexp');
var validator = module.parent.require('validator');
var nconf = module.parent.require('nconf');

var Topics = module.parent.require('./topics');
var User = module.parent.require('./user');
var Groups = module.parent.require('./groups');
var Notifications = module.parent.require('./notifications');
var Privileges = module.parent.require('./privileges');
var Utils = module.parent.require('../public/src/utils');

var SocketPlugins = module.parent.require('./socket.io/plugins');

var regex = XRegExp('(?:>|\\s)(@[\\p{L}\\d\\-_.]+)', 'g');	// used in post text transform, accounts for HTML
var rawRegex = XRegExp('(?:^|\\s)(@[\\p{L}\\d\-_.]+)', 'g');	// used in notifications, as raw text is passed in this hook
var isLatinMention = /@[\w\d\-_.]+$/;
var removePunctuationSuffix = function(string) {
	return string.replace(/[!?.]*$/, '');
};

var Mentions = {};

SocketPlugins.mentions = {};

Mentions.notify = function(postData) {
	function filter(matches, method, callback) {
		async.filter(matches, function(match, next) {
			method(match, function(err, exists) {
				next(!err && exists);
			});
		}, function(matches) {
			callback(null, matches);
		});
	}

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
			filter(matches, User.existsBySlug, next);
		},
		groupRecipients: function(next) {
			filter(matches, Groups.existsBySlug, next);
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

			var title = S(results.topic.title).decodeHTMLEntities().s;
			var titleEscaped = title.replace(/%/g, '&#37;').replace(/,/g, '&#44;');

			var uids = results.uids.filter(function(uid, index, array) {
				return array.indexOf(uid) === index && parseInt(uid, 10) !== parseInt(postData.uid, 10) && results.topicFollowers.indexOf(uid.toString()) === -1;
			});

			var groupMemberUids = [];
			results.groupData.groupNames.forEach(function(groupName, index) {
				results.groupData.groupMembers[index] = results.groupData.groupMembers[index].filter(function(uid, index, array) {
					return array.indexOf(uid) === index &&
						uids.indexOf(uid) === -1 &&
						parseInt(uid, 10) !== parseInt(postData.uid, 10) &&
						results.topicFollowers.indexOf(uid.toString()) === -1 &&
						groupMemberUids.indexOf(uid) === -1;
				});
				groupMemberUids = groupMemberUids.concat(results.groupData.groupMembers[index]);
			});

			sendNotificationToUids(postData, uids, 'user', '[[notifications:user_mentioned_you_in, ' + results.author + ', ' + titleEscaped + ']]');
			results.groupData.groupNames.forEach(function(groupName, index) {
				var memberUids = results.groupData.groupMembers[index];
				sendNotificationToUids(postData, memberUids, groupName, '[[notifications:user_mentioned_group_in, ' + results.author + ', ' + groupName + ', ' + titleEscaped + ']]');
			});
		});
	});
};

function sendNotificationToUids(postData, uids, nidType, notificationText) {
	if (!uids.length) {
		return;
	}

	async.waterfall([
		function(next) {
			Privileges.topics.filterUids('read', postData.tid, uids, next);
		},
		function(_uids, next) {
			uids = _uids;
			if (!uids.length) {
				return;
			}
			createNotification(postData, nidType, notificationText, next);
		},
		function(notification, next) {
			if (notification) {
				Notifications.push(notification, uids);
			}
			next();
		}
	], function(err) {
		if (err) {
			return winston.error(err);
		}
	});
}

function createNotification(postData, nidType, notificationText, callback) {
	Notifications.create({
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
					? new RegExp('[>|\\s]' + match + '\\b', 'g')
					: new RegExp('[>|\\s]' + match, 'g');

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
								? '<a class="plugin-mentions-a" href="' + nconf.get('url') + '/uid/' + results.uid + '">' + match + '</a>'
								: '<a class="plugin-mentions-a" href="' + nconf.get('url') + '/groups/' + slug + '">' + match + '</a>';

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
	var matchers = [isMarkdown ? '\\[.*?\\]\\(.*?\\)' : '<a[\\s\\S]*?</a>'];
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
