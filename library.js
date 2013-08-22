var	Mentions = {
		addMentions: function(postContent, callback) {
			// '@baris is wurst, @julianlam is best'.replace(/(@\b[\w\d\-_]+\b)/g, '<a href="#">$1</a>');
			var	regex = /(@\b[\w\d\-_]+\b)/g,
				relativeUrl = global.nconf.get('relative_url') || '';

			postContent = postContent.replace(/(@\b[\w\d\-_]+\b)/g, function(match) {
				return '<a class="plugin-mentions-a" href="' + relativeUrl + '/users/' + match.slice(1) + '">' + match + '</a>';
			});

			callback(null, postContent);
		}
	};

module.exports = Mentions;