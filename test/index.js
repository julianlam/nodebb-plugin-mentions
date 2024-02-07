'use strict';

/* globals describe, it, beforeEach */

const assert = require('assert');

const user = require.main.require('./src/user');
const utils = require.main.require('./src/utils');

const main = require('../library');

const regex = main._regex;

/* const db = */require.main.require('./test/mocks/databasemock');

// use core slugify module
const slugify = require.main.require('./src/slugify');

const strings = [
	'@testUser',
	'@testUser some text',
	'some text @testUser',
	'<a href="/user/testuser">@testUser</a>',
	'<a href="/user/testuser">@testUser</a> some text',
	'some text <a href="/user/testuser">@testUser</a>',
	'end of sentence. @testUser',
	'@testUser.',
	'@testUser\'s some text',
	'> @testUser blockquoted',
	'(@testUser) bracketed',
	'elon makes me think of this emoji: 💩@testUser',
];

describe('regex', () => {
	const matcher = new RegExp(regex);

	strings.forEach((string) => {
		it('should match a mention in all test strings', () => {
			const matches = string.match(matcher);
			assert(matches, `@testUser was not found in this string: ${string}`);
			assert.equal(slugify(matches[0]), 'testuser');
		});
	});

	// TODO: Test for unicode/non-latin mention
	// TODO: Ideally the regex matcher should be its own utility function in `lib/`
});

describe('splitter', () => {
	const utility = require('../lib/utility');
	const testHTMLText = 'this is a post with <code>stuff in code</code> and a\n\n<blockquote>blockquote or two</blockquote>';
	const testMdText = 'this is a post with `stuff in code` and a \n\n>blockquote or two';
	const testCodefirstMdText = '`code starts` with regular text afterwards';
	const testCodefirstHTMLText = '<code>code starts</code> with regular text afterwards';

	it('should not error', () => {
		const results = [
			utility.split(testHTMLText, false, true, false),
			utility.split(testHTMLText, false, false, true),
			utility.split(testHTMLText, false, true, true),
			utility.split(testMdText, true, true, false),
			utility.split(testMdText, true, false, true),
			utility.split(testMdText, true, true, true),
		];
		results.forEach(test => assert(test));
	});

	describe('HTML text', () => {
		it('should split blockquotes properly', () => {
			const result = utility.split(testHTMLText, false, true, false);
			assert.equal(result[0], 'this is a post with <code>stuff in code</code> and a\n\n');
			assert.equal(result[1], '<blockquote>blockquote or two</blockquote>');
		});

		it('should split inline code properly', () => {
			const result = utility.split(testHTMLText, false, false, true);
			assert.equal(result[0], 'this is a post with ');
			assert.equal(result[1], '<code>stuff in code</code>');
			assert.equal(result[2], ' and a\n\n<blockquote>blockquote or two</blockquote>');
		});

		it('should split both blockquotes and code properly', () => {
			const result = utility.split(testHTMLText, false, true, true);
			assert.equal(result[0], 'this is a post with ');
			assert.equal(result[1], '<code>stuff in code</code>');
			assert.equal(result[2], ' and a\n\n');
			assert.equal(result[3], '<blockquote>blockquote or two</blockquote>');
		});

		it('should split properly if a post starts with a code block', () => {
			const result = utility.split(testCodefirstMdText, true, true, true);
			assert.equal(result[0], '');
			assert.equal(result[1], '`code starts`');
			assert.equal(result[2], ' with regular text afterwards');
		});

		it('should split properly if a post starts with a code block', () => {
			const result = utility.split(testCodefirstHTMLText, false, true, true);
			assert.equal(result[0], '');
			assert.equal(result[1], '<code>code starts</code>');
			assert.equal(result[2], ' with regular text afterwards');
		});

		it('should split HTML code blocks that are wrapped with only a <pre>', () => {
			const testString = '<p dir="auto">test text</p>\n<pre>var value = \'@admin\';</pre>\nafter text';
			const result = utility.split(testString, false, false, true);
			assert.equal(result[0], '<p dir="auto">test text</p>\n');
			assert.equal(result[1], '<pre>var value = \'@admin\';</pre>');
			assert.equal(result[2], '\nafter text');
		});

		it('should not accidentally split on <annotation> HTML tag', () => {
			const testString = '<p dir="auto">wonderful</p><annotation>what is an annotation anyway</annotation><a href="/">what</a>';
			const results = [
				utility.split(testString, false, false, false),
				utility.split(testString, false, false, true),
				utility.split(testString, false, true, false),
				utility.split(testString, false, true, true),
			];

			results.forEach(result => assert.strictEqual(result[0], '<p dir="auto">wonderful</p><annotation>what is an annotation anyway</annotation>'));
			results.forEach(result => assert.strictEqual(result[1], '<a href="/">what</a>'));
		});
	});

	describe('Markdown text', () => {
		it('should split blockquotes properly', () => {
			const result = utility.split(testMdText, true, true, false);
			assert.equal(result[0], 'this is a post with `stuff in code` and a \n\n');
			assert.equal(result[1], '>blockquote or two');
		});

		it('should split inline code properly', () => {
			const result = utility.split(testMdText, true, false, true);
			assert.equal(result[0], 'this is a post with ');
			assert.equal(result[1], '`stuff in code`');
			assert.equal(result[2], ' and a \n\n>blockquote or two');
		});

		it('should split both blockquotes and code properly', () => {
			const result = utility.split(testMdText, true, true, true);
			assert.equal(result[0], 'this is a post with ');
			assert.equal(result[1], '`stuff in code`');
			assert.equal(result[2], ' and a \n\n');
			assert.equal(result[3], '>blockquote or two');
		});

		it('should split code fences properly', () => {
			const testString = 'this is some text\n\n```\nvar a = \'@admin\';\n```\nafter text';
			const result = utility.split(testString, true, false, true);
			assert.equal(result[0], 'this is some text\n\n');
			assert.equal(result[1], '```\nvar a = \'@admin\';\n```');
			assert.equal(result[2], '\nafter text');
		});
	});
});

describe('parser', () => {
	let slug;
	let uid;
	let emailUid;

	beforeEach(async () => {
		slug = utils.generateUUID().slice(0, 10);
		uid = await user.create({ username: slug });
		emailUid = await user.create({ username: `${slug}@test.nodebb.org` });
	});

	it('should properly parse both users even if one user\'s username is a subset of the other', async () => {
		await user.create({ username: `${slug}-two` });
		const md = `This sentence contains two mentions: @${slug} and @${slug}-two`;

		const html = await main.parseRaw(md);

		assert.strictEqual(html, `This sentence contains two mentions: <a class="plugin-mentions-user plugin-mentions-a" href="http://127.0.0.1:4567/uid/1">@${slug}</a> and <a class="plugin-mentions-user plugin-mentions-a" href="http://127.0.0.1:4567/uid/2">@${slug}-two</a>`);
	});

	strings.forEach((string) => {
		it('should match correctly replace the mentions in all test strings', async () => {
			const index = string.indexOf('@testUser');
			let check = string;
			if (!index || string[index - 1] !== '>') {
				check = string.replace(/@testUser/g, `<a class="plugin-mentions-user plugin-mentions-a" href="http://127.0.0.1:4567/uid/${uid}">@${slug}</a>`);
				string = string.replace(/testUser/g, slug);
			}
			const html = await main.parseRaw(string);

			assert(html);

			assert.strictEqual(html, check);
		});
		// re-enable this when NodeBB slugify doesn't strip out `@` from usernames
		it.skip('should match correctly email-like mentions in all test strings', async () => {
			const index = string.indexOf('@testUser');
			let check = string;
			if (!index || string[index - 1] !== '>') {
				check = string.replace(/@testUser/g, `<a class="plugin-mentions-user plugin-mentions-a" href="http://127.0.0.1:4567/uid/${emailUid}">@${slug}@test.nodebb.org</a>`);
				string = string.replace(/testUser/g, `${slug}@test.nodebb.org`);
			}
			const html = await main.parseRaw(string);

			assert(html);

			assert.strictEqual(html, check);
		});
	});
});
