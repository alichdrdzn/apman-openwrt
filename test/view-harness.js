// Headless exercise of the apman LuCI view: stubs the LuCI runtime
// (Class/E/dom/rpc/ui/poll/view) with a minimal DOM, then runs load(),
// render() and the main modal flows to surface runtime errors that only
// show up in a browser.
const fs = require('fs');

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'luci-app-apman/files/www/luci-static/resources/view/apman/overview.js');
let code = fs.readFileSync(SRC, 'utf8');
code = code.split('\n').filter(l => !/^'require [a-z.]+';$/.test(l.trim())).join('\n');

/* ---------- tiny DOM ---------- */
const byId = {};
let idSeq = 0;
class Node {
	constructor(tag) {
		this.tagName = String(tag).toUpperCase();
		this.children = [];
		this.attrs = {};
		this.parentNode = null;
		this._text = '';
		this._html = '';
	}
	appendChild(c) {
		if (c == null) return c;
		if (!(c instanceof Node)) c = document.createTextNode(c);
		c.parentNode = this;
		this.children.push(c);
		return c;
	}
	removeChild(c) {
		const i = this.children.indexOf(c);
		if (i >= 0) this.children.splice(i, 1);
		return c;
	}
	setAttribute(k, v) {
		this.attrs[k] = v;
		if (k === 'id') byId[v] = this;
	}
	getAttribute(k) { return this.attrs[k]; }
	get firstChild() { return this.children[0] || null; }
	get lastChild() { return this.children[this.children.length - 1] || null; }
	set className(v) { this.attrs['class'] = v; }
	get className() { return this.attrs['class'] || ''; }
	set innerHTML(v) { this._html = String(v); this.children = []; }
	get innerHTML() { return this._html; }
	set textContent(v) { this._text = String(v); }
	get textContent() {
		if (this._text) return this._text;
		return this.children.map(c => (typeof c === 'string' ? c : c.textContent)).join('');
	}
	get classList() {
		const self = this;
		return {
			add: (...c) => { self.attrs['class'] = [self.attrs['class'] || ''].concat(c).join(' ').trim(); },
			remove: (c) => { self.attrs['class'] = (self.attrs['class'] || '').split(/\s+/).filter(x => x && x !== c).join(' '); },
			contains: (c) => (self.attrs['class'] || '').split(/\s+/).includes(c)
		};
	}
	querySelector() { return null; }
	querySelectorAll() { return []; }
}

function isNode(x) { return x instanceof Node; }

function append(node, data) {
	if (Array.isArray(data)) {
		for (const d of data) append(node, d);
		return node.lastChild;
	}
	if (typeof data === 'function') return append(node, data(node));
	if (isNode(data)) return node.appendChild(data);
	if (data === null || data === undefined) return null;
	const t = String(data);
	if (t === '') return null;
	return node.appendChild(document.createTextNode(t));
}

function E() {
	let html = arguments[0], attr = arguments[1], data = arguments[2];
	if (!(attr instanceof Object) || Array.isArray(attr) || isNode(attr)) { data = attr; attr = null; }
	let node;
	if (Array.isArray(html)) {
		node = new Node('#fragment');
		for (const h of html) append(node, E(h));
	} else if (isNode(html)) {
		node = html;
	} else {
		node = new Node(html);
	}
	if (attr) for (const k in attr) if (attr[k] !== null && attr[k] !== undefined) node.setAttribute(k, attr[k]);
	append(node, data);
	return node;
}

const dom = {
	content(node, children) {
		if (!isNode(node)) return null;
		node.children = [];
		return append(node, children);
	},
	append,
	parent: (n) => n.parentNode
};

const document = {
	body: new Node('body'),
	getElementById: (id) => byId[id] || null,
	createElement: (t) => new Node(t),
	createTextNode: (t) => { const n = new Node('#text'); n._text = String(t); return n; },
	createDocumentFragment: () => new Node('#fragment'),
	querySelector: () => document.body
};

/* ---------- LuCI stubs ---------- */
const calls = [];
const sample = {
	status: {
		ts: 1792485462,
		settings: { enabled: 1, interval: 10, history_days: 30, snapshot_minutes: 10, ignored_macs: '' },
		names: { 'aa:aa:aa:aa:aa:01': 'Kids tablet' },
		devices: {
			aaaaaaaaaa01: {
				mac: 'aa:aa:aa:aa:aa:01', alias: 'Wifi phone', ip: '192.168.1.42',
				state: 'active', block: 0, pause_until: 0, limit_enabled: 1,
				down_kbps: 5000, up_kbps: 2000,
				dn_bps: 1234567, up_bps: 98765,
				today_dn: 104857600, today_up: 20971520, used_month: 734003200,
				quota_daily_mb: 200, quota_monthly_mb: 5000, overquota: 0
			},
			aaaaaaaaaa02: {
				mac: 'aa:aa:aa:aa:aa:02', alias: 'Desk PC', ip: '192.168.1.9',
				state: 'capped', block: 0, pause_until: 0, limit_enabled: 1,
				down_kbps: 0, up_kbps: 0,
				dn_bps: 0, up_bps: 0,
				today_dn: 314572800, today_up: 10485760, used_month: 2147483648,
				quota_daily_mb: 250, quota_monthly_mb: 2000, overquota: 1
			},
			aaaaaaaaaa03: {
				mac: 'aa:aa:aa:aa:aa:03', alias: '', ip: '',
				state: 'blocked', block: 1, pause_until: 0, limit_enabled: 0,
				down_kbps: 0, up_kbps: 0, dn_bps: 0, up_bps: 0,
				today_dn: 0, today_up: 0, used_month: 0,
				quota_daily_mb: 0, quota_monthly_mb: 0, overquota: 0
			}
		},
		unknown: {
			'aa:aa:aa:aa:aa:09': { up: 1200, dn: 34000, last_change: 1792485400 },
			'aa:aa:aa:aa:aa:0a': { up: 0, dn: 5, last_change: 1792485200 }
		}
	},
	history: {
		days: (() => {
			const o = {};
			const ids = ['aaaaaaaaaa01', 'aaaaaaaaaa02'];
			for (let i = 1; i <= 12; i++) {
				const d = '2026-10-' + String(i).padStart(2, '0');
				o[d] = {};
				o[d][ids[0]] = [1048576 * i, 5242880 * i];
				o[d][ids[1]] = [524288, 2097152 * i];
			}
			return o;
		})()
	}
};

const rpc = {
	declare(opts) {
		if (typeof opts !== 'object' || !opts.object || !opts.method)
			throw new TypeError('bad declare');
		if (Array.isArray(opts.params))
			throw new TypeError('array-style params would break object call sites');
		return function (args) {
			calls.push({ object: opts.object, method: opts.method, params: opts.params || {}, args: args || null });
			if (opts.method === 'status') return Promise.resolve(sample.status);
			if (opts.method === 'history') return Promise.resolve(sample.history);
			return Promise.resolve({ ok: 1 });
		};
	}
};

const ui = {
	modals: [],
	notes: [],
	showModal(title, children) {
		const dlg = E('div', { class: 'modal' }, [ E('h4', {}, title), children ]);
		ui.modals.push({ title, dlg });
		return dlg;
	},
	hideModal() {},
	addNotification(title, children, cls) { ui.notes.push({ title, children, cls }); }
};

const poll = { fns: [], add(fn, interval) { if (typeof fn !== 'function') throw new TypeError('poll fn'); poll.fns.push({ fn, interval }); return true; } };
const view = { extend(o) { return o; } };
const _ = (s) => ({ toString: () => s, replace: String.prototype.replace.bind(s) }) && String(s);

/* ---------- run ---------- */
const results = [];
function check(name, fn) {
	try { const v = fn(); results.push(['PASS', name, v === undefined ? '' : v]); }
	catch (e) { results.push(['FAIL', name, e && e.message ? e.message : String(e)]); }
}

let mod;
check('module evaluates (no top-level TypeError)', () => {
	mod = new Function('rpc', 'view', 'ui', 'dom', 'poll', 'E', '_', 'document', code)(
		rpc, view, ui, dom, poll, E, _, document);
	if (!mod || typeof mod.render !== 'function') throw new Error('no render()');
	return 'view.extend returned render+load';
});

let data;
check('load() resolves status + history', () => {
	const p = mod.load();
	if (!p || typeof p.then !== 'function') throw new Error('load must return a promise');
	return 'promise returned';
});

check('render() builds the dashboard', () => {
	// load() is synchronous-resolving; emulate LuCI passing the resolved tuple
	const tuple = [sample.status, sample.history];
	const root = mod.render.call(mod, tuple);
	if (!isNode(root)) throw new Error('render did not return a node');
	const count = (n) => 1 + n.children.reduce((s, c) => s + (isNode(c) ? count(c) : 0), 0);
	const n = count(root);
	if (n < 60) throw new Error('suspiciously small tree: ' + n + ' nodes');
	const stray = [];
	(function walk(n) {
		if (n._text === '' ) stray.push(n.tagName);
		n.children.forEach(c => { if (isNode(c)) walk(c); });
	})(root);
	return n + ' nodes';
});

check('poll registered for live refresh', () => {
	if (!poll.fns.length) throw new Error('nothing polled');
	return poll.fns.length + ' fn @' + poll.fns[0].interval + 's';
});

check('no "[object" leaked into rendered text', () => {
	const root = mod.render.call(mod, [sample.status, sample.history]);
	let bad = 0;
	(function walk(n) {
		if (typeof n === 'string' && n.indexOf('[object') >= 0) bad++;
		if (n._text && n._text.indexOf('[object') >= 0) bad++;
		n.children.forEach(c => { if (isNode(c)) walk(c); });
	})(root);
	if (bad) throw new Error(bad + ' occurrences');
	return 'clean';
});

check('chart renders one column per history day', () => {
	const root = mod.render.call(mod, [sample.status, sample.history]);
	let cols = 0;
	(function walk(n) {
		if (isNode(n) && (n.attrs['class'] || '').split(/\s+/).includes('apm-col')) cols++;
		n.children.forEach(c => { if (isNode(c)) walk(c); });
	})(root);
	if (cols !== 12) throw new Error('expected 12 columns, got ' + cols);
	return cols + ' columns';
});

check('every modal flow opens without throwing', () => {
	const root = mod.render.call(mod, [sample.status, sample.history]);
	// render() registers inputs by id; the modals read them back out
	mod.openEdit('aaaaaaaaaa01', sample.status.devices.aaaaaaaaaa01);
	mod.openPause('aa:aa:aa:aa:aa:01', null);
	mod.openAdopt('aa:aa:aa:aa:aa:09', 'Kids tablet');
	mod.openSettings();
	mod.forget('aa:aa:aa:aa:aa:01', 'Wifi phone');
	mod.toggleBlock(sample.status.devices.aaaaaaaaaa03, null);
	mod.renderUnknown('busy');
	mod.renderUnknown('all');
	mod.renderHistory();
	return ui.modals.length + ' modals';
});

check('save payload from Edit modal is well formed', () => {
	// create the inputs the modal reads, then invoke its Save handler
	const d = sample.status.devices.aaaaaaaaaa01;
	mod.openEdit('aaaaaaaaaa01', d);
	const m = ui.modals[ui.modals.length - 1].dlg;
	const inputs = {};
	(function walk(n) {
		if (isNode(n) && n.attrs && n.attrs.id) inputs[n.attrs.id] = n;
		n.children.forEach(c => { if (isNode(c)) walk(c); });
	})(m);
	for (const id of ['apm-alias', 'apm-dn', 'apm-up', 'apm-lim', 'apm-qd', 'apm-qm'])
		if (!inputs[id]) throw new Error('missing input ' + id);
	inputs['apm-dn'].value = '5';
	inputs['apm-up'].value = '2';
	inputs['apm-qd'].value = '200';
	inputs['apm-qm'].value = '5000';
	inputs['apm-alias'].value = 'Phone';
	inputs['apm-lim'].checked = true;
	let saveBtn = null;
	(function walk(n) {
		if (isNode(n) && n.tagName === 'BUTTON' && n.textContent === 'Save') saveBtn = n;
		n.children.forEach(c => { if (isNode(c)) walk(c); });
	})(m);
	if (!saveBtn) throw new Error('no Save button');
	saveBtn.attrs.click();
	const c = calls.filter(x => x.method === 'save').pop();
	if (!c) throw new Error('save not called');
	const p = c.args;
	if (p.mac !== d.mac || p.down_kbps !== 5000 || p.up_kbps !== 2000 ||
		p.quota_daily_mb !== 200 || p.quota_monthly_mb !== 5000 ||
		p.limit_enabled !== 1) throw new Error('bad payload: ' + JSON.stringify(p));
	return JSON.stringify(p);
});

check('every rpc method the view uses exists in the rpcd plugin', () => {
	const fs2 = require('fs');
	const rpcd = fs2.readFileSync(path.join(ROOT, 'luci-app-apman/files/usr/libexec/rpcd/apman'), 'utf8');
	const listLine = rpcd.split('\n').find(l => l.trim().startsWith('{') && l.indexOf('"status"') >= 0);
	const advertised = JSON.parse(listLine);
	const used = [...new Set(calls.map(c => c.method))];
	const missing = used.filter(m => !(m in advertised));
	if (missing.length) throw new Error('not in rpcd list: ' + missing.join(','));
	// partial payloads are intentional (block toggle sends mac+block only), so
	// the view may omit declared keys; what must hold is that every key it DOES
	// send is declared, otherwise rpc silently drops it
	for (const c of calls) {
		const decl = advertised[c.method];
		if (!decl || typeof decl !== 'object') continue;
		for (const k in c.args || {})
			if (!(k in decl)) throw new Error(c.method + ' sends undeclared param ' + k);
	}
	return used.length + ' methods: ' + used.join(',');
});

/* ---------- report ---------- */
let fail = 0;
for (const [st, name, info] of results) {
	if (st === 'FAIL') fail++;
	console.log(`${st}  ${name}${info ? '  [' + info + ']' : ''}`);
}
console.log(`\n${results.length - fail}/${results.length} passed`);
process.exit(fail ? 1 : 0);
