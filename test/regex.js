'use strict';

/* globals describe, it, before */

const assert = require('assert');
const XRegExp = require('xregexp');
const regex = XRegExp('(?:^|\\s|\\>|;)(@[\\p{L}\\d\\-_.]+)', 'g');

const db = require.main.require('./test/mocks/databasemock');

// use core slugify module
const slugify = require.main.require('./src/slugify');

describe('regex', function () {
	const matcher = new RegExp(regex);
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
	]
	it('should match a mention in all strings', () => {
		strings.forEach(string => {
			const matches = string.match(matcher);
			assert(matches);
			assert.equal(slugify(matches[0]), 'testuser');
		});
	});

	// TODO: Test for unicode/non-latin mention
	// TODO: Ideally the regex matcher should be its own utility function in `lib/`
});

describe('splitter', function () {
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
