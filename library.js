var	async = require('async'),
	Mentions = {
		exists: function(slug, callback) {
			RDB.get('userslug:' + slug + ':uid', function(err, uid) {
				callback(!!uid);
			});
		},
		addMentions: function(postContent, callback) {
			var	_self = this,
				regex = /(@\b[\w\d\-_]+\b)/g,
				relativeUrl = global.nconf.get('relative_url') || '',
				matches = postContent.match(/(@\b[\w\d\-_]+\b)/g);;

			if (matches) {
				async.filter(matches, function(match, next) {
					var	userslug = match.slice(1);
					_self.exists(userslug, next);
				}, function(matches) {
					matches.forEach(function(match) {
						var	userslug = match.slice(1);
						postContent = postContent.replace(match, '<a class="plugin-mentions-a" href="' + relativeUrl + '/users/' + userslug + '">' + match + '</a>');
					});

					callback(null, postContent);
				});
			} else callback(null, postContent);

			// '<a class="plugin-mentions-a" href="' + relativeUrl + '/users/' + userslug + '">' + match + '</a>';
		}
	};

module.exports = Mentions;