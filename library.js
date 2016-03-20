'use strict';

var	async = module.parent.require('async'),
	S = module.parent.require('string'),
	XRegExp = module.parent.require('xregexp'),
	validator = module.parent.require('validator'),

	nconf = module.parent.require('nconf'),
	Topics = module.parent.require('./topics'),
	User = module.parent.require('./user'),
	Groups = module.parent.require('./groups'),
	Notifications = module.parent.require('./notifications'),
	Privileges = module.parent.require('./privileges'),
	Utils = module.parent.require('../public/src/utils'),

	SocketPlugins = module.parent.require('./socket.io/plugins'),

	regex = XRegExp('(?:>|\\s)(@[\\p{L}\\d\\-_.]+)', 'g'),	// used in post text transform, accounts for HTML
	rawRegex = XRegExp('(?:^|\\s)(@[\\p{L}\\d\-_.]+)', 'g'),	// used in notifications, as raw text is passed in this hook
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

			Privileges.topics.filterUids('read', postData.tid, uids, function(err, uids) {
				if (err || !uids.length) {
					return;
				}

				var title = S(results.topic.title).decodeHTMLEntities().s;
				var titleEscaped = title.replace(/%/g, '&#37;').replace(/,/g, '&#44;');

				Notifications.create({
					bodyShort: '[[mentions:user_mentioned_you_in, ' + results.author + ', ' + titleEscaped + ']]',
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
	if (!cleanedContent) {
		return callback(null, content);
	}
	var matches = cleanedContent.match(regex);
	var atIndex;

	if (!matches) {
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
		atIndex = match.indexOf('@');
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

				content = content.replace(regex, function(match) {
					// Again, cleaning up lookaround leftover bits
					var atIndex = match.indexOf('@');
					var plain = match.slice(0, atIndex);
					match = match.slice(atIndex);
					var str = results.uid
							? '<a class="plugin-mentions-a" href="' + nconf.get('url') + '/user/' + slug + '">' + match + '</a>'
							: '<a class="plugin-mentions-a" href="' + nconf.get('url') + '/groups/' + slug + '">' + match + '</a>';

					return plain + str;
				});
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
