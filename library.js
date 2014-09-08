var	async = require('async'),
	XRegExp = require('xregexp').XRegExp,

	nconf = module.parent.require('nconf'),
	Topics = module.parent.require('./topics'),
	Posts = module.parent.require('./posts'),
	User = module.parent.require('./user'),
	Groups = module.parent.require('./groups'),
	Notifications = module.parent.require('./notifications'),
	Meta = module.parent.require('./meta'),
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
	var	_self = this,
		cleanedContent = postData.content.replace(/^>.*$/gm, ''),	// Removing blockquoted content from the checked string
		matches = cleanedContent.match(regex);

	if (matches) {

		// Eliminate duplicates
		matches = matches.filter(function(cur, idx) {
			return idx === matches.indexOf(cur);
		});

		async.filter(matches, function(match, next) {
			var	slug = Utils.slugify(match.slice(1));
			async.parallel([
				async.apply(User.exists, slug),
				async.apply(Groups.exists, match.slice(1))
			], function(err, results) {
				next(!err && results ? results[0] || results[1] : false);
			});
		}, function(matches) {
			async.parallel({
				topic: function(next) {
					Topics.getTopicFields(postData.tid, ['title'], next);
				},
				author: function(next) {
					User.getUserField(postData.uid, 'username', next);
				},
				ids: function(next) {
					async.map(matches, function(match, next) {
						var	slug = Utils.slugify(match.slice(1));

						User.getUidByUserslug(slug, function(err, uid) {
							if (err) {
								return next(err);
							}

							if (uid) {
								return next(null, uid);
							}

							next(null, match.slice(1));
						});
					}, next);
				}
			}, function(err, results) {
				var	userRecipients = results.ids.filter(function(id) {
						var	iid = parseInt(id, 10);
						return !isNaN(iid) && iid !== parseInt(postData.uid, 10);
					}),
					groupRecipients = results.ids.filter(function(id) {
						return isNaN(parseInt(id, 10));
					});

				if (!err && (userRecipients.length > 0 || groupRecipients.length > 0)) {
					Notifications.create({
						bodyShort: '[[notifications:user_mentioned_you_in, ' + results.author + ', ' + results.topic.title + ']]',
						bodyLong: postData.content,
						pid: postData.pid,
						uniqueId: 'topic:' + postData.tid + ':uid:' + postData.uid,
						tid: postData.tid,
						from: postData.uid,
						importance: 6
					}, function(err, nid) {
						if (err) {
							return;
						}
						if (userRecipients.length > 0) {
							Notifications.push(nid, userRecipients);
						}
						if (groupRecipients.length > 0) {
							async.each(groupRecipients, function(groupName, next) {
								Notifications.pushGroup(nid, groupName, next);
							});
						}
					});
				}
			});
		});
	}
};

Mentions.addMentions = function(postContent, callback) {
	var	_self = this,
	relativeUrl = nconf.get('relative_url') || '',
	matches = postContent.match(regex);

	if (matches) {
		// Eliminate duplicates
		matches = matches.filter(function(cur, idx) {
			return idx === matches.indexOf(cur);
		});

		async.each(matches, function(match, next) {
			var slug = Utils.slugify(match.slice(1));

			match = removePunctuationSuffix(match);

			async.parallel({
				groupName: async.apply(Groups.exists, slug),
				uid: async.apply(User.getUidByUserslug, slug)
			}, function(err, results) {
				if (results.uid) {
					if (isLatinMention.test(match)) {
						postContent = postContent.replace(new RegExp(match + '\\b', 'g'), '<a class="plugin-mentions-a" href="' + relativeUrl + '/user/' + slug + '">' + match + '</a>');
					} else {
						postContent = postContent.replace(new RegExp(match, 'g'), '<a class="plugin-mentions-a" href="' + relativeUrl + '/user/' + slug + '">' + match + '</a>');
					}
				} else if (results.groupName) {
					postContent = postContent.replace(new RegExp(match + '\\b', 'g'), '<a class="plugin-mentions-a" href="' + relativeUrl + '/groups/' + slug + '">' + match + '</a>');
				}

				next();
			});
		}, function(err) {
			callback(null, postContent);
		});
	} else callback(null, postContent);
};

/*
	WebSocket methods
*/

SocketPlugins.mentions.listGroups = function(socket, data, callback) {
	Groups.list({
		removeEphemeralGroups: true,
		truncateUserList: true
	}, function(err, groups) {
		if (err || !Array.isArray(groups)) {
			return callback(null, []);
		}
		callback(null, groups.map(function(groupObj) {
			return groupObj.name;
		}));
	});
};

module.exports = Mentions;
