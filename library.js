'use strict';

var	async = require('async'),
	XRegExp = require('xregexp').XRegExp,

	nconf = module.parent.require('nconf'),
	Topics = module.parent.require('./topics'),
	User = module.parent.require('./user'),
	Groups = module.parent.require('./groups'),
	Notifications = module.parent.require('./notifications'),
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

		async.parallel({
			topic: function(next) {
				Topics.getTopicFields(postData.tid, ['title'], next);
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
			}
		}, function(err, results) {
			if (err) {
				return;
			}

			var uids = results.uids.concat(results.groupsMembers).filter(function(uid, index, array) {
				return array.indexOf(uid) === index && parseInt(uid, 10) !== parseInt(postData.uid, 10);
			});

			if (uids.length > 0) {
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
					Notifications.push(notification, results.uids);
				});
			}
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

Mentions.addMentions = function(data, callback) {
	var relativeUrl = nconf.get('relative_path') || '';

	if (!data || !data.postData || !data.postData.content) {
		return callback(null, data);
	}

	var cleanedContent = Mentions.clean(data.postData.content, false, false, true);

	var matches = cleanedContent.match(regex);

	if (!matches) {
		return callback(null, data);
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
					? '<a class="plugin-mentions-a" href="' + relativeUrl + '/user/' + slug + '">' + match + '</a>'
					: '<a class="plugin-mentions-a" href="' + relativeUrl + '/groups/' + slug + '">' + match + '</a>';

				data.postData.content = data.postData.content.replace(regex, str);
			}

			next();
		});
	}, function(err) {
		callback(err, data);
	});
};

Mentions.clean = function(input, isMarkdown, stripBlockquote, stripCode) {
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
	Groups.getGroups(0, -1, function(err, groups) {
		if (err) {
			return callback(err);
		}
		groups = groups.filter(function(group) {
			return group && group.indexOf(':privileges:') === -1 && group !== 'registered-users' && group !== 'guests' && group !== 'administrators';
		});
		callback(null, groups);
	});
};

module.exports = Mentions;
