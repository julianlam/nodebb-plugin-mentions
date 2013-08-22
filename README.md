# Username Mentions

This NodeBB plugin allows posters to reference (or *mention*) other users on a NodeBB by simply
precluding the `@` symbol before a username.

A link is automatically added to the post.

## Installation

    npm install nodebb-plugin-mentions

... or if you're feeling particularly risky, clone this repo and use `npm link` to "install" this plugin.

## Future functionality

* Actual checking to make sure the user mentioned actually exists
* Notification to be sent to users when they are mentioned
* CSS to make the anchor stand out a bit