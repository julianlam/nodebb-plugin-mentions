var	async = require('async'),
	Topics = require('../../src/topics'),
	User = require('../../src/user'),
	Notifications = require('../../src/notifications'),
	Mentions = {
		exists: function(slug, callback) {
			RDB.get('userslug:' + slug + ':uid', function(err, uid) {
				callback(!!uid);
			});
		},
		notify: function(postData) {
			var	_self = this,
				regex = /(@\b[\w\d\-_]+\b)/g,
				matches = postData.content.match(regex);

			if (matches) {
				async.filter(matches, function(match, next) {
					var	slug = match.slice(1);
					_self.exists(slug, next);
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
								var	slug = match.slice(1);
								User.get_uid_by_userslug(slug, function(uid) {
									next(null, uid);
								});
							}, next);
						}
					}, function(err, results) {
						if (!err) {
							Notifications.create('<strong>' + results.author + '</strong> mentioned you in "<strong>' + results.title + '</strong>"', null, '/topic/' + postData.tid, 'mention:' + postData.tid, function(nid) {
								Notifications.push(nid, results.uids);
							});
						}
					});
				});
			}
		},
		addMentions: function(postObj, callback) {
			var	_self = this,
				postContent = postObj.content,
				regex = /(@\b[\w\d\-_]+\b)/g,
				relativeUrl = global.nconf.get('relative_url') || '',
				matches = postContent.match(regex),
				uniqueMatches = [];

			if (matches) {
				// Validate matches
				matches.forEach(function(match) {
					if (uniqueMatches.indexOf(match) === -1) uniqueMatches.push(match);
				});
				async.filter(uniqueMatches, function(match, next) {
					var	slug = match.slice(1);
					User.exists(slug, function(exists) {
						next(exists);
					});
				}, function(matches) {
					if (matches) {
						postObj.content = postObj.content.replace(regex, function(match) {
							if (matches.indexOf(match) !== -1) {
								var	userslug = match.slice(1);
								return '<a class="plugin-mentions-a" href="' + relativeUrl + '/users/' + userslug + '">' + match + '</a>'
							} else return match;
						});
						callback(null, postObj);
					} else callback(null, postObj);
				});
			} else callback(null, postObj);
		}
	};

module.exports = Mentions;