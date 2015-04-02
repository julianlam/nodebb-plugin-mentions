"use strict";
/* globals socket, app, utils */


(function(window) {
	window.Mentions = {
		groups: null,
		addAutofill: function(element, localUserList) {
			var subset;

			element.textcomplete([{
				match: /\B@([^\s\n]*)?$/,
				search: function (term, callback) {
					var usernames;
					if (!term) {
						usernames = localUserList.concat(window.Mentions.groups).filter(function(value, index, array) {
							return array.indexOf(value) === index && value !== app.user.username;
						}).sort(function(a, b) {
							return a.toLocaleLowerCase() > b.toLocaleLowerCase();
						});
						return callback(usernames);
					}

					socket.emit('user.search', {query: term}, function(err, userdata) {
						if (err) {
							return callback([]);
						}

						usernames = userdata.users.map(function(user) {
							return user.username;
						});

						subset = localUserList.concat(window.Mentions.groups).filter(function(username) {
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
						if (app.user.username && usernames.indexOf(app.user.username) !== -1) {
							usernames.splice(usernames.indexOf(app.user.username), 1);
						}

						callback(usernames);
					});
				},
				index: 1,
				replace: function (mention) {
					return '@' + utils.slugify(mention, true) + ' ';
				},
				cache: true
			}], {zIndex: 20000, placement: "abs|bottom"});

			element.attr('data-mentions', '1');
		}
	};

	$(document).ready(function() {
		socket.emit('plugins.mentions.listGroups', function(err, groupNames) {
			window.Mentions.groups = groupNames;
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

			window.Mentions.addAutofill(composer, DOMusers);
			$('.textcomplete-wrapper').css('height', '100%').find('textarea').css('height', '100%');
		});
	});
})(window);
