'use strict';

var	async = module.parent.require('async'),
	XRegExp = module.parent.require('xregexp').XRegExp,
	validator = module.parent.require('validator'),

	nconf = module.parent.require('nconf'),
	Topics = module.parent.require('./topics'),
	User = module.parent.require('./user'),
	Groups = module.parent.require('./groups'),
	Notifications = module.parent.require('./notifications'),
	Privileges = module.parent.require('./privileges'),
	Utils = module.parent.require('../public/src/utils'),

	SocketPlugins = module.parent.require('./socket.io/plugins'),

	regex = XRegExp('(@[\\p{L}\\d\\-_.]+)', 'g'),
	isLatinMention = /@[\w\d\-_.]+$/,
	removePunctuationSuffix = function(string) {
		return string.replace(/[!?.]*$/, '');
	},

	Mentions = {};

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
	var matches = cleanedContent.match(regex);

	if (!matches) {
		return;
	}

	var noMentionGroups = ['registered-users', 'guests'];

	matches = matches.map(function(match) {
		return Utils.slugify(match.slice(1));
	}).filter(function(match, index, array) {
		return match && array.indexOf(match) === index && noMentionGroups.indexOf(match) === -1;
	});

	if (!matches.length) {
		return;
	}

	async.parallel({
		userRecipients: function(next) {
			filter(matches, User.exists, next);
		},
		groupRecipients: function(next) {
			filter(matches, Groups.exists, next);
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
			groupsMembers: function(next) {
				getGroupMemberUids(results.groupRecipients, next);
			},
			topicFollowers: function(next) {
				Topics.getFollowers(postData.tid, next);
			}
		}, function(err, results) {
			if (err) {
				return;
			}

			var uids = results.uids.concat(results.groupsMembers).filter(function(uid, index, array) {
				return array.indexOf(uid) === index && parseInt(uid, 10) !== parseInt(postData.uid, 10) && results.topicFollowers.indexOf(uid.toString()) === -1;
			});

			if (!uids.length) {
				return;
			}

			Privileges.categories.filterUids('read', results.topic.cid, uids, function(err, uids) {
				if (err || !uids.length) {
					return;
				}

				Notifications.create({
					bodyShort: '[[notifications:user_mentioned_you_in, ' + results.author + ', ' + results.topic.title + ']]',
					bodyLong: postData.content,
					nid: 'tid:' + postData.tid + ':pid:' + postData.pid + ':uid:' + postData.uid,
					pid: postData.pid,
					tid: postData.tid,
					from: postData.uid,
					importance: 6
				}, function(err, notification) {
					if (err || !notification) {
						return;
					}
					Notifications.push(notification, uids);
				});
			});
		});
	});
};

function getGroupMemberUids(groupRecipients, callback) {
	async.map(groupRecipients, function(slug, next) {
		Groups.getGroupNameByGroupSlug(slug, next);
	}, function(err, groups) {
		if (err) {
			return callback(err);
		}
		async.map(groups, function(group, next) {
			Groups.getMembers(group, 0, -1, next);
		}, function(err, results) {
			if (err) {
				return callback(err);
			}

			var uids = [];
			results.forEach(function(members) {
				uids = uids.concat(members);
			});
			uids = uids.filter(function(uid, index, array) {
				return parseInt(uid, 10) && array.indexOf(uid) === index;
			});
			callback(null, uids);
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
	var cleanedContent = Mentions.clean(content, false, false, true);

	var matches = cleanedContent.match(regex);

	if (!matches) {
		return callback(null, content);
	}

	// Eliminate duplicates
	matches = matches.filter(function(cur, idx) {
		return idx === matches.indexOf(cur);
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
					? new RegExp(match + '\\b', 'g')
					: new RegExp(match, 'g');

				var str = results.uid
					? '<a class="plugin-mentions-a" href="' + nconf.get('url') + '/user/' + slug + '">' + match + '</a>'
					: '<a class="plugin-mentions-a" href="' + nconf.get('url') + '/groups/' + slug + '">' + match + '</a>';

				content = content.replace(regex, str);
			}

			next();
		});
	}, function(err) {
		callback(err, content);
	});
};

Mentions.clean = function(input, isMarkdown, stripBlockquote, stripCode) {
	if (!input) {
		return input;
	}
	if (stripBlockquote) {
		var bqMatch = isMarkdown ? /^>.*$/gm : /^<blockquote>.*<\/blockquote>/gm;
		input = input.replace(bqMatch, '');
	}
	if (stripCode) {
		var pfMatch = isMarkdown ? /`[^`\n]+`/gm : /<code>.*<\/code>/gm;
		input = input.replace(pfMatch, '');
	}

	return input;
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
