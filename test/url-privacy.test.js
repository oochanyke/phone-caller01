'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function readPage(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

function extractLastScript(html) {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0);
  return scripts.at(-1)[1];
}

function runPage(name, href) {
  const html = readPage(name);
  const parsed = new URL(href);
  const elements = new Map();
  let replacedUrl = '';

  const location = {
    href: parsed.href,
    search: parsed.search,
    hash: parsed.hash,
  };
  const context = {
    URL,
    URLSearchParams,
    navigator: { userAgent: 'test' },
    setTimeout() {},
    window: {
      location,
      history: {
        state: null,
        replaceState(_state, _title, replacement) {
          replacedUrl = replacement;
        },
      },
    },
    document: {
      title: 'test',
      getElementById(id) {
        if (!elements.has(id)) {
          elements.set(id, { href: '', style: {}, textContent: '', className: '' });
        }
        return elements.get(id);
      },
    },
  };

  vm.runInNewContext(extractLastScript(html), context);
  return { html, elements, replacedUrl };
}

test('SMS fragment parameters work and are removed from the address', () => {
  const result = runPage('sms.html', 'https://example.test/sms.html#phone=09012345678&token=test_token');
  assert.equal(new URL(result.replacedUrl).search, '');
  assert.equal(new URL(result.replacedUrl).hash, '');
  assert.match(result.elements.get('openSmsButton').href, /^sms:09012345678/);
  assert.match(result.elements.get('messagePreview').textContent, /atobarai-entry\/#token=test_token/);
  assert.doesNotMatch(result.elements.get('messagePreview').textContent, /atobarai-entry\/\?token=/);
});

test('already-issued SMS query links remain compatible and are sanitized', () => {
  const result = runPage('sms.html', 'https://example.test/sms.html?phone=09012345678&token=test_token');
  assert.equal(new URL(result.replacedUrl).search, '');
  assert.equal(new URL(result.replacedUrl).hash, '');
  assert.match(result.elements.get('openSmsButton').href, /^sms:09012345678/);
});

test('call fragment and legacy query links both remain compatible', () => {
  for (const href of [
    'https://example.test/call.html#number=09012345678',
    'https://example.test/call.html?number=09012345678',
  ]) {
    const result = runPage('call.html', href);
    assert.equal(new URL(result.replacedUrl).search, '');
    assert.equal(new URL(result.replacedUrl).hash, '');
    assert.equal(result.elements.get('manualLink').href, 'tel:09012345678');
  }
});

test('both helper pages prohibit referrer transmission', () => {
  for (const name of ['sms.html', 'call.html']) {
    assert.match(readPage(name), /<meta name="referrer" content="no-referrer">/);
  }
});
