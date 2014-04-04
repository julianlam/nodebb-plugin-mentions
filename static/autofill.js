$(document).ready(function() {
	var	groups;
	socket.emit('plugins.mentions.listGroups', function(err, groupNames) {
		console.log(groupNames);
		groups = groupNames;
	});

	$(window).on('action:composer.loaded', function(e, data) {
		var composer = $('#cmp-uuid-' + data.post_uuid + ' .write'),
			DOMusers = [],
			subset,

			collapseSpaces = function(username) {
				if (typeof username !== 'string') {
					username = username.toString();
				}

				return username.replace(/\s/g, '-');
			};

		// Retrieve DOM users
		$('.posts [data-pid] .username-field').each(function(idx, el) {
			var	username = el.getAttribute('data-username');
			if (DOMusers.indexOf(username) === -1) {
				DOMusers.push(username);
			}
		});

		composer.textcomplete([{
			match: /\B@([^\s\n]*)?$/,
			search: function (term, callback) {
				if (!term) {
					return callback(DOMusers.concat(groups).sort(function(a, b) {
						return a.toLocaleLowerCase() > b.toLocaleLowerCase();
					}));
				}

				socket.emit('user.search', term, function(err, userdata) {
					if (err) {
						return callback([]);
					}

					subset = DOMusers.concat(groups).filter(function(username) {
						return username.toLocaleLowerCase().indexOf(term) !== -1;
					}).map(function(username) {
						return username.toLocaleLowerCase();
					});

					var	results = userdata.users.map(function(user) {
							return user.username;
						}).sort(function(a, b) {
							if (subset.indexOf(a.toLocaleLowerCase()) !== -1 && subset.indexOf(b.toLocaleLowerCase()) === -1) {
								return -1;
							} else if (subset.indexOf(a.toLocaleLowerCase()) === -1 && subset.indexOf(b.toLocaleLowerCase()) !== -1) {
								return 1;
							} else {
								return a.toLocaleLowerCase() > b.toLocaleLowerCase();
							}
						});

					// Remove current user from suggestions
					if (app.username && results.indexOf(app.username) !== -1) {
						results.splice(results.indexOf(app.username), 1);
					}

					callback(results);
				});
			},
			index: 1,
			replace: function (mention) {
				return '@' + collapseSpaces(mention) + ' ';
			},
			cache: true
		}]);

		composer.attr('data-mentions', '1');

		$('.textcomplete-wrapper').css('height', '100%').find('textarea').css('height', '100%');
	});
});