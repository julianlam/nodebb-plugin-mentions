$(document).ready(function() {
	socket.emit('plugins.mentions.listGroups', function(err, groupNames) {
		Mentions.groups = groupNames;
	});

	$(window).on('action:composer.loaded', function(e, data) {
		var composer = $('#cmp-uuid-' + data.post_uuid + ' .write'),
			DOMusers = [];

		// Retrieve DOM users
		$('.posts [data-pid] .username-field').each(function(idx, el) {
			var	username = el.getAttribute('data-username');
			if (DOMusers.indexOf(username) === -1) {
				DOMusers.push(username);
			}
		});

		Mentions.addAutofill(composer, DOMusers);
		$('.textcomplete-wrapper').css('height', '100%').find('textarea').css('height', '100%');
	});
});

(function(window) {
	window.Mentions = {
		groups: null,
		addAutofill: function(element, localUserList) {
			var subset,
				collapseSpaces = function(username) {
					if (typeof username !== 'string') {
						username = username.toString();
					}

					return username.replace(/\s/g, '-');
				};

			element.textcomplete([{
				match: /\B@([^\s\n]*)?$/,
				search: function (term, callback) {
					var usernames;
					if (!term) {
						usernames = localUserList.concat(Mentions.groups).filter(function(value, index, array) {
							return array.indexOf(value) === index && value !== app.username;
						}).sort(function(a, b) {
							return a.toLocaleLowerCase() > b.toLocaleLowerCase();
						})
						return callback(usernames);
					}

					socket.emit('user.search', term, function(err, userdata) {
						if (err) {
							return callback([]);
						}

						usernames = userdata.users.map(function(user) {
							return user.username;
						});

						subset = localUserList.concat(Mentions.groups).filter(function(username) {
							return username.toLocaleLowerCase().indexOf(term.toLocaleLowerCase()) !== -1;
						});

						usernames = usernames.concat(subset).filter(function(value, index, array) {
							return array.indexOf(value) === index;
						});

						subset = subset.map(function(name) {
							return name.toLocaleLowerCase();
						});

						usernames.sort(function(a, b) {
							if (subset.indexOf(a.toLocaleLowerCase()) !== -1 && subset.indexOf(b.toLocaleLowerCase()) === -1) {
								return -1;
							} else if (subset.indexOf(a.toLocaleLowerCase()) === -1 && subset.indexOf(b.toLocaleLowerCase()) !== -1) {
								return 1;
							} else {
								return a.toLocaleLowerCase() > b.toLocaleLowerCase();
							}
						});

						// Remove current user from suggestions
						if (app.username && usernames.indexOf(app.username) !== -1) {
							usernames.splice(usernames.indexOf(app.username), 1);
						}

						callback(usernames);
					});
				},
				index: 1,
				replace: function (mention) {
					return '@' + collapseSpaces(mention) + ' ';
				},
				cache: false
			}]);

			element.attr('data-mentions', '1');
		}
	};
})(window);