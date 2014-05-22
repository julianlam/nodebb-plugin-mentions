var	async = require('async'),
	XRegExp = require('xregexp').XRegExp,

	nconf = module.parent.require('nconf'),
	Topics = module.parent.require('./topics'),
	User = module.parent.require('./user'),
	Groups = module.parent.require('./groups'),
	Notifications = module.parent.require('./notifications'),
	Utils = module.parent.require('../public/src/utils'),

	regex = XRegExp('(@[\\p{L}\\d\\-_]+)', 'g'),
	isLatinMention = /@[\w\d\-_.]+$/,

	SocketPlugins = module.parent.require('./socket.io/plugins'),

	Mentions = {};
	SocketPlugins.mentions = {};

Mentions.notify = function(postData) {
	var	_self = this,
		cleanedContent = postData.content.replace(/<blockquote>[\s\S]+?<\/blockquote>/g, ''),	// Removing blockquoted content from the checked string
		matches = postData.content.match(regex);

	if (matches) {
		// Eliminate duplicates
		matches = matches.filter(function(cur, idx) {
			return idx === matches.indexOf(cur);
		});

		async.filter(matches, function(match, next) {
			var	slug = Utils.slugify(match.slice(1));
			User.exists(slug, function(err, exists) {
				next(exists);
			});
		}, function(matches) {
			async.parallel({
				topic: function(next) {
					Topics.getTopicFields(postData.tid, ['title', 'slug'], next);
				},
				author: function(next) {
					User.getUserField(postData.uid, 'username', next);
				},
				uids: function(next) {
					async.map(matches, function(match, next) {
						var	slug = Utils.slugify(match.slice(1));
						User.getUidByUserslug(slug, next);
					}, next);
				}
			}, function(err, results) {
				var	recipients = results.uids.filter(function(uid) {
						return parseInt(uid, 10) !== postData.uid;
					});

				if (!err && recipients.length > 0) {
					Notifications.create({
						text: '<strong>' + results.author + '</strong> mentioned you in "<strong>' + results.topic.title + '</strong>"',
						path: '/topic/' + results.topic.slug + '#' + postData.pid,
						uniqueId: 'topic:' + postData.tid,
						from: postData.uid
					}, function(nid) {
						Notifications.push(nid, recipients);
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
			var userslug = Utils.slugify(match.slice(1));
			User.getUidByUserslug(userslug, function(err, uid) {
				if(uid) {
					if (isLatinMention.test(match)) {
						postContent = postContent.replace(new RegExp(match + '\\b', 'g'), '<a class="plugin-mentions-a" href="' + relativeUrl + '/user/' + userslug + '">' + match + '</a>');
					} else {
						postContent = postContent.replace(new RegExp(match, 'g'), '<a class="plugin-mentions-a" href="' + relativeUrl + '/user/' + userslug + '">' + match + '</a>');
					}
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
		callback(null, groups.map(function(groupObj) {
			return groupObj.name;
		}));
	});
};

module.exports = Mentions;
