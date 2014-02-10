$(document).ready(function() {
	$('body').on('focus', '.composer .title, .composer .write', function(){
		var composer = $('.composer .write');

		composer.textcomplete([{
			match: /\B@([^\s\n]*)$/,
			search: function (term, callback) {
				socket.emit('user.search', term, function(err, userdata) {
					// The following check is only necessary for NodeBB 0.3.x. Remove this for mentions v0.4.0.
					if (!Array.isArray(userdata)) {
						userdata = userdata.users;
					}

					if (err) {
						return callback([]);
					}

					callback(userdata.map(function(user) {
						return user.username;
					}).sort(function(a, b) {
						return a.toLocaleLowerCase() > b.toLocaleLowerCase();
					}));
				});
			},
			index: 1,
			replace: function (mention) {
				return '@' + utils.slugify(mention) + ' ';
			},
			cache: true
		}]);

		composer.attr('data-mentions', '1');

		$('.textcomplete-wrapper').css('height', '100%').find('textarea').css('height', '100%');
	});
});