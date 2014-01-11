var	async = require('async'),
	XRegExp = require('xregexp').XRegExp,

	nconf = module.parent.require('nconf'),
	Topics = module.parent.require('./topics'),
	User = module.parent.require('./user'),
	Notifications = module.parent.require('./notifications'),
	Utils = module.parent.require('../public/src/utils'),
	websockets = module.parent.require('./socket.io');

var regex = XRegExp('(@[\\p{L}\\d\\-_]+)', 'g'),
	Mentions = {};

Mentions.notify = function(postData) {
	var	_self = this,
		matches = postData.content.match(regex);

	if (matches) {
		async.filter(matches, function(match, next) {
			var	slug = Utils.slugify(match.slice(1));
			User.exists(slug, next);
		}, function(matches) {
			async.parallel({
				title: function(next) {
					Topics.getTopicField(postData.tid, 'title', next);
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
				if (!err) {
					Notifications.create('<strong>' + results.author + '</strong> mentioned you in "<strong>' + results.title + '</strong>"', '/topic/' + postData.tid, 'topic:' + postData.tid, function(nid) {
						Notifications.push(nid, results.uids);
					});
				}
			});
		});
	}
};

Mentions.addMentions = function(postContent, callback) {
	var	_self = this,
		relativeUrl = nconf.get('relative_url') || '',
		matches = postContent.match(regex),
		uniqueMatches = [];

	if (matches) {
		// Eliminate duplicates
		matches.forEach(function(match) {
			if (uniqueMatches.indexOf(match) === -1) uniqueMatches.push(match);
		});

		// Filter out those that aren't real users
		async.filter(uniqueMatches, function(match, next) {
			var	slug = Utils.slugify(match.slice(1));
			User.exists(slug, next);
		}, function(matches) {
			if (matches) {
				async.each(matches, function(match, next) {
					var	userslug = Utils.slugify(match.slice(1));
					User.getUidByUserslug(userslug, function(err, uid) {
						postContent = postContent.replace(new RegExp(match, 'g'), '<a class="plugin-mentions-a" href="' + relativeUrl + '/user/' + userslug + '"><i class="fa fa-user ' + (websockets.isUserOnline(uid) ? 'online' : 'offline') + '"></i> ' + match + '</a>');
						next();
					});
				}, function(err) {
					callback(null, postContent);
				});
			} else callback(null, postContent);
		});
	} else callback(null, postContent);
};

module.exports = Mentions;
