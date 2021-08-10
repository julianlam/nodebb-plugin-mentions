'use strict';

module.exports = {
	nconf: require.main.require('nconf'),
	winston: require.main.require('winston'),

	api: require.main.require('./src/api'),
	batch: require.main.require('./src/batch'),
	db: require.main.require('./src/database'),
	Groups: require.main.require('./src/groups'),
	Meta: require.main.require('./src/meta'),
	Notifications: require.main.require('./src/notifications'),
	plugins: require.main.require('./src/plugins'),
	posts: require.main.require('./src/posts'),
	Privileges: require.main.require('./src/privileges'),
	slugify: require.main.require('./src/slugify'),
	SocketPlugins: require.main.require('./src/socket.io/plugins'),
	Topics: require.main.require('./src/topics'),
	User: require.main.require('./src/user'),
	utils: require.main.require('./public/src/utils'),
};
