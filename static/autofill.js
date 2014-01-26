$(document).ready(function() {
	$('body').on('focus', '.composer .title, .composer .write', function(){
		var composer = $('.composer .write');
		if (composer.parent('.textcomplete-wrapper').length === 0) {
			composer.textcomplete([{
				match: /\B@([^\s\n]*)$/,
				search: function (term, callback) {
					socket.emit('user.search', term, function(err, userdata) {
						if (err) {
							return callback([]);
						}

						callback(userdata.map(function(user) {
							return user.username;
						}).sort(function(a, b) {
							return a.toLocaleLowerCase() > b.toLocaleLowerCase();
						}));
					});
					// socket.emit('modules.composer.autofill', {'term': term}, function(err, data) {
					//     callback(data.sort(function(a, b) {							// Sort alphabetically
					//         return a.toLocaleLowerCase() > b.toLocaleLowerCase();
					//     }));
					// });
				},
				index: 1,
				replace: function (mention) {
					return '@' + mention.replace(/\s/g, '-') + ' ';
				},
				cache: true
			}]);

			$('.textcomplete-wrapper').css('height', '100%').find('textarea').css('height', '100%');
		}
	});
});