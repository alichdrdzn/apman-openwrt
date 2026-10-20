'use strict';
'require view';
'require ui';
'require dom';
'require poll';
'require rpc';

var callStatus   = rpc.declare({ object: 'apman', method: 'status',   expect: {} });
var callHistory  = rpc.declare({ object: 'apman', method: 'history',  expect: {} });
var callSave     = rpc.declare({ object: 'apman', method: 'save', expect: {},
	params: { mac: '', alias: '', down_kbps: 0, up_kbps: 0, limit_enabled: 0,
	block: 0, quota_daily_mb: 0, quota_monthly_mb: 0 } });
var callPause    = rpc.declare({ object: 'apman', method: 'pause',
	params: { mac: '', minutes: 0 }, expect: {} });
var callUnblock  = rpc.declare({ object: 'apman', method: 'unblock',
	params: { mac: '' }, expect: {} });
var callForget   = rpc.declare({ object: 'apman', method: 'forget',
	params: { mac: '' }, expect: {} });
var callAdopt    = rpc.declare({ object: 'apman', method: 'adopt',
	params: { mac: '', alias: '' }, expect: {} });
var callIgnore   = rpc.declare({ object: 'apman', method: 'ignore',
	params: { mac: '' }, expect: {} });
var callSettings = rpc.declare({ object: 'apman', method: 'settings',
	params: { enabled: 0, interval: 0, history_days: 0, snapshot_minutes: 0,
	ignored_macs: '', whitelist: 0 }, expect: {} });
var callApply    = rpc.declare({ object: 'apman', method: 'apply', expect: {} });

var css = [
	'.apm-root{--apm-bg:#0e1117;--apm-card:#161b26;--apm-card2:#1b2230;--apm-line:#242d3e;',
	'--apm-txt:#e7eaf2;--apm-mut:#8b94a9;--apm-dn:#38bdf8;--apm-up:#a78bfa;',
	'--apm-on:#34d399;--apm-idle:#64748b;--apm-pause:#fbbf24;--apm-block:#f87171;',
	'color:var(--apm-txt);font-size:13px}',
	'.apm-root *{box-sizing:border-box}',
	'.apm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}',
	'.apm-card{background:linear-gradient(180deg,var(--apm-card),var(--apm-card2));',
	'border:1px solid var(--apm-line);border-radius:14px;padding:14px 15px;',
	'box-shadow:0 6px 18px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:10px}',
	'.apm-head{display:flex;align-items:center;gap:8px}',
	'.apm-name{font-size:15px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
	'.apm-chip{font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;letter-spacing:.3px}',
	'.apm-chip--online{background:rgba(52,211,153,.15);color:var(--apm-on)}',
	'.apm-chip--active{background:rgba(56,189,248,.14);color:var(--apm-dn)}',
	'.apm-chip--idle{background:rgba(100,116,139,.18);color:var(--apm-idle)}',
	'.apm-chip--paused{background:rgba(251,191,36,.15);color:var(--apm-pause)}',
	'.apm-chip--blocked{background:rgba(248,113,113,.15);color:var(--apm-block)}',
	'.apm-chip--capped{background:rgba(251,146,60,.16);color:#fb923c}',
	'.apm-cap.apm-over b{color:var(--apm-block)}',
	'.apm-meta{color:var(--apm-mut);font-size:11.5px;word-break:break-all}',
	'.apm-speeds{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
	'.apm-speed{background:rgba(255,255,255,.03);border:1px solid var(--apm-line);',
	'border-radius:10px;padding:8px 10px}',
	'.apm-speed b{display:block;font-size:16px;font-weight:650;font-variant-numeric:tabular-nums}',
	'.apm-speed span{color:var(--apm-mut);font-size:10.5px;letter-spacing:.4px;text-transform:uppercase}',
	'.apm-dn-c{color:var(--apm-dn)}.apm-up-c{color:var(--apm-up)}',
	'.apm-usage{display:flex;justify-content:space-between;color:var(--apm-mut);font-size:12px}',
	'.apm-usage b{color:var(--apm-txt);font-weight:600;font-variant-numeric:tabular-nums}',
	'.apm-cap{font-size:12px;color:var(--apm-mut)}',
	'.apm-cap b{color:var(--apm-txt)}',
	'.apm-acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}',
	'.apm-btn{appearance:none;background:rgba(255,255,255,.04);color:var(--apm-txt);',
	'border:1px solid var(--apm-line);border-radius:8px;padding:5px 10px;font-size:12px;',
	'cursor:pointer;transition:background .15s,border-color .15s}',
	'.apm-btn:hover{background:rgba(255,255,255,.09);border-color:#33405a}',
	'.apm-btn--warn{color:var(--apm-pause)}.apm-btn--danger{color:var(--apm-block)}',
	'.apm-btn--go{color:var(--apm-on)}',
	'.apm-btn[disabled]{opacity:.45;cursor:default}',
	'.apm-sect{margin:22px 0 10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
	'.apm-sect h3{margin:0;font-size:15px;font-weight:650}',
	'.apm-sect .apm-sub{color:var(--apm-mut);font-size:12px}',
	'.apm-sum{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0 4px}',
	'.apm-sum .apm-speed b{font-size:17px}',
	'.apm-chart{background:var(--apm-card);border:1px solid var(--apm-line);border-radius:14px;',
	'padding:14px 16px 8px;display:flex;align-items:flex-end;gap:5px;height:220px;overflow-x:auto}',
	'.apm-col{flex:1 0 26px;display:flex;flex-direction:column;justify-content:flex-end;height:100%;min-width:26px}',
	'.apm-bar-dn,.apm-bar-up{border-radius:3px 3px 0 0}',
	'.apm-bar-dn{background:linear-gradient(180deg,var(--apm-dn),rgba(56,189,248,.45))}',
	'.apm-bar-up{background:linear-gradient(180deg,var(--apm-up),rgba(167,139,250,.45));border-radius:0}',
	'.apm-xlab{text-align:center;color:var(--apm-mut);font-size:10px;margin-top:5px;white-space:nowrap}',
	'.apm-legend{display:flex;gap:14px;color:var(--apm-mut);font-size:12px;margin-top:8px}',
	'.apm-dot{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}',
	'.apm-hint{color:var(--apm-mut);font-size:11.5px;line-height:1.45;margin-top:3px}',
	'.apm-hint--warn{color:var(--apm-pause)}',
	'.apm-net{font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;',
	'margin-left:6px;border:1px solid var(--apm-line)}',
	'.apm-net--ok{color:var(--apm-on)}',
	'.apm-net--no{color:var(--apm-block);border-color:var(--apm-block)}',
	'.apm-empty{color:var(--apm-mut);padding:26px 10px;text-align:center;',
	'border:1px dashed var(--apm-line);border-radius:12px}',
	'.apm-root .cbi-value{border:none;background:none;padding:6px 0}',
	'.apm-root .cbi-value-title{color:var(--apm-txt);font-weight:600}',
	'.apm-root input[type=text],.apm-root input[type=number],.apm-root textarea,',
	'.apm-root select{background:var(--apm-bg)!important;color:var(--apm-txt)!important;',
	'border:1px solid var(--apm-line)!important;border-radius:8px!important}',
	'.apm-root .modal{max-width:560px}',
	'.apm-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}'
].join('');

function fmtBytes(n) {
	n = Number(n) || 0;
	if (n < 1024) return n + ' B';
	if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
	if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
	return (n / 1073741824).toFixed(2) + ' GB';
}

function fmtBps(n) {
	n = Number(n) || 0;
	if (n < 1000) return n + ' bps';
	if (n < 1000000) return (n / 1000).toFixed(1) + ' kbps';
	return (n / 1000000).toFixed(2) + ' Mbps';
}

function fmtKbps(k) {
	k = Number(k) || 0;
	if (!k) return null;
	if (k < 1000) return k + ' kbps';
	return (k % 1000 === 0 ? (k / 1000) : (k / 1000).toFixed(1)) + ' Mbps';
}

function pauseLeft(until, now) {
	var s = Math.max(0, Math.floor(until - now));
	if (s >= 3600) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
	if (s >= 60) return Math.floor(s / 60) + 'm';
	return s + 's';
}

return view.extend({
	load: function () {
		return Promise.all([ callStatus(), callHistory() ]);
	},

	render: function (data) {
		var self = this;
		this.status  = (data && data[0]) || {};
		this.history = (data && data[1] && data[1].days) || {};
		this.devEls  = {};

		var root = E('div', { 'class': 'apm-root' }, [
			E('style', {}, css),
			E('div', { 'class': 'apm-sect' }, [
				E('h3', {}, _('AP Manager')),
				E('span', { 'class': 'apm-sub' },
					_('Per-device speed caps, pause and traffic history for this access point')),
				E('span', { style: 'flex:1' }),
				E('button', { 'class': 'apm-btn', 'click': function () { self.openSettings(); } },
					_('Settings')),
				E('button', { 'class': 'apm-btn', 'click': function () { self.reload(); } },
					_('Refresh'))
			]),
			this.summaryEl = E('div', { 'class': 'apm-sum' }),
			this.summary(),
			E('div', { 'class': 'apm-sect' }, [
				E('h3', {}, _('Devices')),
				this.countEl = E('span', { 'class': 'apm-sub' })
			]),
			this.gridEl = E('div', { 'class': 'apm-grid' }),
			this.devices(),
			E('div', { 'class': 'apm-sect' }, [
				E('h3', {}, _('Not managed')),
				E('span', { 'class': 'apm-sub' },
					_('Seen on the network but not adopted yet')),
				E('span', { style: 'flex:1' }),
				this.unkSel = E('select', { 'class': 'apm-btn',
					'change': function () { self.renderUnknown(this.value); } }, [
					E('option', { value: 'recent' }, _('Most recent')),
					E('option', { value: 'busy' }, _('Most traffic')),
					E('option', { value: 'all' }, _('All'))
				])
			]),
			this.unkEl = E('div', { 'class': 'apm-grid' }),
			this.renderUnknown('recent'),
			E('div', { 'class': 'apm-sect' }, [
				E('h3', {}, _('Traffic history')),
				this.rangeSel = E('select', { 'class': 'apm-btn',
					'change': function () { self.renderHistory(); } }, [
					E('option', { value: '7' }, _('Last 7 days')),
					E('option', { value: '14', selected: 'selected' }, _('Last 14 days')),
					E('option', { value: '30' }, _('Last 30 days'))
				]),
				this.devSel = E('select', { 'class': 'apm-btn',
					'change': function () { self.renderHistory(); } }),
				E('span', { style: 'flex:1' }),
				this.histTot = E('span', { 'class': 'apm-sub' })
			]),
			this.chartEl = E('div', { 'class': 'apm-chart' }),
			E('div', { 'class': 'apm-legend' }, [
				E('span', {}, [ E('i', { 'class': 'apm-dot', style: 'background:var(--apm-dn)' }),
					_('Downloaded') ]),
				E('span', {}, [ E('i', { 'class': 'apm-dot', style: 'background:var(--apm-up)' }),
					_('Uploaded') ])
			]),
			this.renderHistory()
		]);

		this.fillDevSel();
		poll.add(function () { return self.tick(); }, 5);
		return root;
	},

	summary: function () {
		var st = this.status || {}, devs = st.devices || {};
		var ids = Object.keys(devs), online = 0, off = 0, dn = 0, up = 0;
		for (var i = 0; i < ids.length; i++) {
			var d = devs[ids[i]];
			if (d.state === 'online' || d.state === 'active') online++;
			if (d.block || (d.pause_until > (st.ts || 0)) || d.overquota) off++;
			dn += Number(d.today_dn) || 0;
			up += Number(d.today_up) || 0;
		}
		var mk = function (cls, big, small) {
			return E('div', { 'class': 'apm-speed' }, [
				E('b', { 'class': cls }, big), E('span', {}, small)
			]);
		};
		dom.content(this.summaryEl, [
			mk('', String(ids.length), _('Managed devices')),
			mk('apm-dn-c', String(online), _('Online now')),
			mk(off ? 'apm-up-c' : '', String(off), _('Blocked, paused or capped')),
			mk('apm-dn-c', fmtBytes(dn), _('Downloaded today')),
			mk('apm-up-c', fmtBytes(up), _('Uploaded today'))
		]);
	},

	deviceCard: function (id, d) {
		var self = this, st = this.status || {}, now = Number(st.ts) || 0;
		var paused = d.pause_until > now;
		var state = d.block ? 'blocked' : (paused ? 'paused' : d.state);
		var names = (this.status && this.status.names) || {};
		var alias = d.alias || names[String(d.mac).toLowerCase()] || _('Unnamed device');
		var dnC = fmtKbps(d.down_kbps), upC = fmtKbps(d.up_kbps);

		var chip = E('span', { 'class': 'apm-chip apm-chip--' + state }, _(state));
		// whitelist mode: say plainly whether this device reaches the internet
		var wl = Number((st.settings || {}).whitelist) || 0;
		var netOk = !wl || (!d.block && !paused && !d.overquota);
		var netChip = wl ? E('span', { 'class': 'apm-net ' + (netOk ? 'apm-net--ok' : 'apm-net--no') },
			netOk ? _('net on') : _('net off')) : '';
		var dnB = E('b', { 'class': 'apm-dn-c' }, fmtBps(d.dn_bps));
		var upB = E('b', { 'class': 'apm-up-c' }, fmtBps(d.up_bps));
		var tdB = E('b', { 'class': 'apm-dn-c' }, fmtBytes(d.today_dn));
		var tuB = E('b', { 'class': 'apm-up-c' }, fmtBytes(d.today_up));
		var meta = E('div', { 'class': 'apm-meta' },
			d.mac + (d.ip ? '  ·  ' + d.ip : '') + (paused ? '  ·  ' + _('paused ') + pauseLeft(d.pause_until, now) : ''));

		var dayCap = Number(d.quota_daily_mb) || 0;
		var monCap = Number(d.quota_monthly_mb) || 0;
		var quotaRow = '';
		if (dayCap || monCap) {
			var qp = [];
			if (dayCap) qp.push(fmtBytes((Number(d.today_up) || 0) + (Number(d.today_dn) || 0)) +
				' / ' + fmtBytes(dayCap * 1048576) + ' ' + _('today'));
			if (monCap) qp.push(fmtBytes(d.used_month) + ' / ' + fmtBytes(monCap * 1048576) + ' ' + _('this month'));
			quotaRow = E('div', { 'class': 'apm-cap' + (d.overquota ? ' apm-over' : '') }, [
				_('Data: '), E('b', {}, qp.join('  ·  ')),
				d.overquota ? E('span', {}, '  ·  ' + _('over cap: wifi paused until reset')) : ''
			]);
		}

		var btnPause = E('button', { 'class': 'apm-btn ' + (paused ? 'apm-btn--go' : 'apm-btn--warn'),
			'click': function () { if (paused) self.doPause(d.mac, 0, btnPause); else self.openPause(d.mac, btnPause); } },
			paused ? _('Resume') : _('Pause'));
		var btnBlock = E('button', { 'class': 'apm-btn ' + (d.block ? 'apm-btn--go' : 'apm-btn--danger'),
			'click': function () { self.toggleBlock(d, btnBlock); } },
			d.block ? _('Unblock') : _('Block'));
		var btnEdit = E('button', { 'class': 'apm-btn',
			'click': function () { self.openEdit(id, d); } }, _('Edit'));
		var btnFor = E('button', { 'class': 'apm-btn apm-btn--danger',
			'click': function () { self.forget(d.mac, alias); } }, _('Forget'));

		this.devEls[id] = { dn: dnB, up: upB, td: tdB, tu: tuB, chip: chip };

		return E('div', { 'class': 'apm-card' }, [
			E('div', { 'class': 'apm-head' }, [
				E('div', { 'class': 'apm-name', title: alias }, alias),
				E('span', {}, [ netChip, chip ])
			]),
			meta,
			E('div', { 'class': 'apm-speeds' }, [
				E('div', { 'class': 'apm-speed' }, [ dnB, E('span', {}, _('Down now')) ]),
				E('div', { 'class': 'apm-speed' }, [ upB, E('span', {}, _('Up now')) ])
			]),
			E('div', { 'class': 'apm-usage' }, [
				E('span', {}, [ _('Today '), tdB ]),
				E('span', {}, [ _('↑ '), tuB ])
			]),
			quotaRow,
			E('div', { 'class': 'apm-cap' }, [
				_('Cap: '),
				E('b', {}, d.limit_enabled ? (dnC ? '↓ ' + dnC : 'no ↓') : _('unlimited')),
				' · ',
				E('b', {}, d.limit_enabled ? (upC ? '↑ ' + upC : 'no ↑') : '')
			]),
			E('div', { 'class': 'apm-acts' }, [ btnPause, btnBlock, btnEdit, btnFor ])
		]);
	},

	devices: function () {
		var self = this, devs = (this.status && this.status.devices) || {};
		var ids = Object.keys(devs);
		ids.sort(function (a, b) {
			var ra = { online: 0, active: 1, idle: 2, paused: 3, blocked: 4, capped: 4 };
			var rank = function (d) {
				if (d.block || d.pause_until > ((self.status && self.status.ts) || 0)) return 4;
				return ra[d.state] != null ? ra[d.state] : 3;
			};
			var sa = rank(devs[a]), sb = rank(devs[b]);
			if (sa !== sb) return sa - sb;
			return String(devs[a].alias || '').localeCompare(String(devs[b].alias || ''));
		});
		dom.content(this.gridEl, ids.length ? [] : [
			E('div', { 'class': 'apm-empty', style: 'grid-column:1/-1' },
				_('No managed devices yet. Seen devices appear under "Not managed"; adopt them here.'))
		]);
		for (var i = 0; i < ids.length; i++)
			this.gridEl.appendChild(self.deviceCard(ids[i], devs[ids[i]]));
		if (this.countEl)
			dom.content(this.countEl, _('(%d)').replace('%d', ids.length));
	},

	renderUnknown: function (mode) {
		var self = this, st = this.status || {}, un = st.unknown || {};
		var wl = Number((st.settings || {}).whitelist) || 0;
		var keys = Object.keys(un);
		if (mode === 'busy')
			keys.sort(function (a, b) {
				return ((un[b].up || 0) + (un[b].dn || 0)) - ((un[a].up || 0) + (un[a].dn || 0));
			});
		else
			keys.sort(function (a, b) { return (un[b].last_change || 0) - (un[a].last_change || 0); });
		if (mode === 'recent') keys = keys.slice(0, 12);
		else if (mode !== 'all') keys = keys.slice(0, 24);

		dom.content(this.unkEl, keys.length ? [] : [
			E('div', { 'class': 'apm-empty', style: 'grid-column:1/-1' },
				_('Nothing new: every device seen so far is already managed.'))
		]);
		var names = st.names || {};
		keys.forEach(function (mac) {
		var u = un[mac];
		var seen = u.last_change ? Math.max(0, Math.floor((st.ts - u.last_change) / 60)) : null;
		var name = names[mac] || null;
			self.unkEl.appendChild(E('div', { 'class': 'apm-card' }, [
				E('div', { 'class': 'apm-head' }, [
					E('div', { 'class': 'apm-name' }, name || mac),
					E('span', {}, [
						wl ? E('span', { 'class': 'apm-net apm-net--no' }, _('net off')) : '',
						E('span', { 'class': 'apm-chip apm-chip--idle' },
							seen != null ? (seen < 1 ? _('just now') : seen + ' min') : _('seen'))
					])
				]),
				E('div', { 'class': 'apm-meta' }, name ? mac : ''),
				E('div', { 'class': 'apm-usage' }, [
					E('span', {}, [ _('Total '), E('b', { 'class': 'apm-dn-c' }, fmtBytes(u.dn)) ]),
					E('span', {}, [ _('↑ '), E('b', { 'class': 'apm-up-c' }, fmtBytes(u.up)) ])
				]),
				E('div', { 'class': 'apm-acts' }, [
					E('button', { 'class': 'apm-btn apm-btn--go',
						'click': function () { self.openAdopt(mac, name); } }, _('Adopt')),
					E('button', { 'class': 'apm-btn',
						'click': function () { self.doIgnore(mac, name || mac); } }, _('Hide'))
				])
			]));
		});
	},

	fillDevSel: function () {
		var devs = (this.status && this.status.devices) || {};
		var cur = this.devSel.value || 'all';
		var opts = [ E('option', { value: 'all' }, _('All devices')) ];
		Object.keys(devs).forEach(function (id) {
			opts.push(E('option', { value: id }, devs[id].alias || devs[id].mac));
		});
		dom.content(this.devSel, opts);
		this.devSel.value = cur;
	},

	renderHistory: function () {
		var days = Object.keys(this.history || {}).sort();
		var range = parseInt(this.rangeSel && this.rangeSel.value, 10) || 14;
		var dev = (this.devSel && this.devSel.value) || 'all';
		days = days.slice(-range);

		var max = 0, tdn = 0, tup = 0;
		var rows = days.map(function (d) {
			var o = this.history[d] || {}, up = 0, dn = 0;
			if (dev === 'all') {
				for (var k in o) { up += Number(o[k][0]) || 0; dn += Number(o[k][1]) || 0; }
			} else if (o[dev]) {
				up = Number(o[dev][0]) || 0; dn = Number(o[dev][1]) || 0;
			}
			max = Math.max(max, up + dn);
			tdn += dn; tup += up;
			return { d: d, up: up, dn: dn };
		}, this);

		if (this.histTot)
			dom.content(this.histTot,
				(_('Total: ') + fmtBytes(tdn) + ' ↓   ' + fmtBytes(tup) + ' ↑'));

		if (!rows.length) {
			dom.content(this.chartEl, [
				E('div', { 'class': 'apm-empty', style: 'grid-column:1/-1;align-self:center' },
					_('No history yet. Samples are collected every few minutes and kept for the configured number of days.'))
			]);
			return;
		}
		if (!max) max = 1;
		var cols = rows.map(function (r) {
			var hd = Math.round((r.dn / max) * 150), hu = Math.round((r.up / max) * 150);
			var tip = r.d + '  ↓ ' + fmtBytes(r.dn) + '  ↑ ' + fmtBytes(r.up);
			var bar = [];
			if (hu) bar.push(E('div', { 'class': 'apm-bar-up', style: 'height:' + hu + 'px' }));
			if (hd) bar.push(E('div', { 'class': 'apm-bar-dn', style: 'height:' + hd + 'px' }));
			return E('div', { 'class': 'apm-col', title: tip },
				[ E('div', { style: 'flex:1' }) ].concat(bar).concat([
					E('div', { 'class': 'apm-xlab' }, r.d.slice(5))
				]));
		});
		dom.content(this.chartEl, cols);
	},

	tick: function () {
		var self = this;
		return callStatus().then(function (st) {
			if (!st || !st.devices) return;
			var prevTs = self.status && self.status.ts;
			self.status = st;
			for (var id in self.devEls) {
				var d = st.devices[id], e = self.devEls[id];
				if (!d) continue;
				dom.content(e.dn, fmtBps(d.dn_bps));
				dom.content(e.up, fmtBps(d.up_bps));
				dom.content(e.td, fmtBytes(d.today_dn));
				dom.content(e.tu, fmtBytes(d.today_up));
				var paused = d.pause_until > (st.ts || 0);
				var state = d.block ? 'blocked' : (paused ? 'paused' : d.state);
				e.chip.className = 'apm-chip apm-chip--' + state;
				dom.content(e.chip, _(state));
			}
			self.summary();
			if (!prevTs || st.ts - prevTs >= 120)
				return callHistory().then(function (h) {
					self.history = (h && h.days) || {};
					self.renderHistory();
				});
		});
	},

	reload: function () {
		var self = this;
		return Promise.all([ callStatus(), callHistory() ]).then(function (r) {
			self.status = r[0] || {};
			self.history = (r[1] && r[1].days) || {};
			self.summary();
			self.devices();
			self.renderUnknown(self.unkSel.value);
			self.fillDevSel();
			self.renderHistory();
		});
	},

	flush: function (btn) {
		var self = this;
		if (btn) btn.disabled = true;
		return callApply().then(function () {
			return new Promise(function (res) { setTimeout(res, 600); });
		}).then(function () {
			if (btn) btn.disabled = false;
			return self.reload();
		});
	},

	doPause: function (mac, minutes, btn) {
		var self = this;
		if (btn) btn.disabled = true;
		return callPause({ mac: mac, minutes: minutes }).then(function () {
			return self.flush(btn);
		}, function (e) {
			if (btn) btn.disabled = false;
			ui.addNotification(null, E('p', {}, _('Failed: ') + e), 'error');
		});
	},

	openPause: function (mac, btn) {
		var self = this;
		var opts = [ [ 15, _('15 minutes') ], [ 60, _('1 hour') ], [ 240, _('4 hours') ],
			[ 1440, _('24 hours') ] ];
		var body = E('div', {}, [
			E('p', { style: 'color:var(--apm-mut)' },
				_('Traffic to and from this device is dropped until the time runs out. It can still connect again after that.')),
			E('div', { 'class': 'apm-inline' }, opts.map(function (o) {
				return E('button', { 'class': 'apm-btn apm-btn--warn',
					'click': function () {
						ui.hideModal();
						self.doPause(mac, o[0], btn);
					} }, o[1]);
			})),
			E('div', { 'class': 'apm-inline', style: 'margin-top:10px' }, [
				E('input', { 'type': 'number', 'id': 'apm-custom-min', 'min': '1',
					placeholder: _('custom minutes'), style: 'width:130px' }),
				E('button', { 'class': 'apm-btn apm-btn--warn', 'click': function () {
					var v = parseInt(document.getElementById('apm-custom-min').value, 10);
					if (!v || v < 1) return;
					ui.hideModal();
					self.doPause(mac, v, btn);
				} }, _('Pause'))
			])
		]);
		ui.showModal(_('Pause device'), body);
	},

	toggleBlock: function (d, btn) {
		var self = this;
		if (d.block) {
			if (btn) btn.disabled = true;
			return callUnblock({ mac: d.mac }).then(function () {
				return self.flush(btn);
			});
		}
		ui.showModal(_('Block device'), E('div', {}, [
			E('p', {}, _('Block ' + (d.alias || d.mac) + ' from the network entirely. Wired and wireless both. It can be unblocked at any time.')),
			E('div', { 'class': 'apm-inline' }, [
				E('button', { 'class': 'apm-btn apm-btn--danger', 'click': function () {
					ui.hideModal();
					if (btn) btn.disabled = true;
					callSave({ mac: d.mac, block: 1 }).then(function () {
						return self.flush(btn);
					});
				} }, _('Block now')),
				E('button', { 'class': 'apm-btn', 'click': function () { ui.hideModal(); } }, _('Cancel'))
			])
		]));
	},

	openEdit: function (id, d) {
		var self = this;
		var body = E('div', {}, [
			E('p', { style: 'color:var(--apm-mut);margin-top:0' }, d.mac),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-alias' }, _('Name')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'text', 'id': 'apm-alias', 'value': d.alias || '',
						placeholder: _('e.g. Living room TV') }) ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-dn' }, _('Download cap (Mbps, wifi only)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'number', 'id': 'apm-dn', 'min': '0', 'step': '0.5',
						'value': d.down_kbps ? (d.down_kbps / 1000) : '' ,
						placeholder: _('0 = unlimited') }) ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-up' }, _('Upload cap (Mbps, wifi only)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'number', 'id': 'apm-up', 'min': '0', 'step': '0.5',
						'value': d.up_kbps ? (d.up_kbps / 1000) : '',
						placeholder: _('0 = unlimited') }) ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-lim' }, _('Enforce caps')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'checkbox', 'id': 'apm-lim',
						checked: d.limit_enabled ? 'checked' : null }) ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-qd' }, _('Daily wifi data cap (MB)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'number', 'id': 'apm-qd', 'min': '0', 'step': '100',
						'value': d.quota_daily_mb || '', placeholder: _('0 = unlimited') }) ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-qm' }, _('Monthly wifi data cap (MB)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'number', 'id': 'apm-qm', 'min': '0', 'step': '1000',
						'value': d.quota_monthly_mb || '', placeholder: _('0 = unlimited') }) ])
			]),
			E('div', { 'class': 'apm-inline', style: 'margin-top:8px' }, [
				E('button', { 'class': 'apm-btn apm-btn--go', 'click': function () {
					var mbps = function (x) {
						var v = parseFloat(document.getElementById(x).value);
						return (v > 0) ? Math.round(v * 1000) : 0;
					};
					var mib = function (x) {
						var v = parseInt(document.getElementById(x).value, 10);
						return (v > 0) ? v : 0;
					};
					var payload = {
						mac: d.mac,
						alias: document.getElementById('apm-alias').value.trim(),
						down_kbps: mbps('apm-dn'),
						up_kbps: mbps('apm-up'),
						limit_enabled: document.getElementById('apm-lim').checked ? 1 : 0,
						quota_daily_mb: mib('apm-qd'),
						quota_monthly_mb: mib('apm-qm')
					};
					ui.hideModal();
					callSave(payload).then(function () { return self.flush(); },
						function (e) { ui.addNotification(null, E('p', {}, _('Failed: ') + e), 'error'); });
				} }, _('Save')),
				E('button', { 'class': 'apm-btn', 'click': function () { ui.hideModal(); } }, _('Cancel'))
			])
		]);
		ui.showModal(_('Edit device'), body);
	},

	openAdopt: function (mac, hint) {
		var self = this;
		ui.showModal(_('Adopt device'), E('div', {}, [
			E('p', { style: 'color:var(--apm-mut);margin-top:0' }, mac),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-new-alias' }, _('Name')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'text', 'id': 'apm-new-alias',
						'value': hint || '', placeholder: _('e.g. Mom phone') }) ])
			]),
			E('div', { 'class': 'apm-inline', style: 'margin-top:8px' }, [
				E('button', { 'class': 'apm-btn apm-btn--go', 'click': function () {
					var a = document.getElementById('apm-new-alias').value.trim();
					ui.hideModal();
					callAdopt({ mac: mac, alias: a }).then(function () { return self.flush(); });
				} }, _('Adopt')),
				E('button', { 'class': 'apm-btn', 'click': function () { ui.hideModal(); } }, _('Cancel'))
			])
		]));
	},

	doIgnore: function (mac, label) {
		var self = this;
		return callIgnore({ mac: mac }).then(function () {
			ui.addNotification(null, E('p', {}, _('Hid ') + label + _(' from the device list')));
			return self.reload();
		});
	},

	forget: function (mac, label) {
		var self = this;
		ui.showModal(_('Forget device'), E('div', {}, [
			E('p', {}, _('Remove ' + label + ' from the managed list? Its speed cap and block are dropped. It can be adopted again later.')),
			E('div', { 'class': 'apm-inline' }, [
				E('button', { 'class': 'apm-btn apm-btn--danger', 'click': function () {
					ui.hideModal();
					callForget({ mac: mac }).then(function () { return self.flush(); });
				} }, _('Forget')),
				E('button', { 'class': 'apm-btn', 'click': function () { ui.hideModal(); } }, _('Cancel'))
			])
		]));
	},

	openSettings: function () {
		var self = this, s = (this.status && this.status.settings) || {};
		ui.showModal(_('Settings'), E('div', {}, [
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-en' }, _('Enforcement on')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'checkbox', 'id': 'apm-en',
						checked: s.enabled ? 'checked' : null }) ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-int' },
					_('Sampling interval (seconds)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'number', 'id': 'apm-int', 'min': '5', 'max': '300',
						'value': s.interval || 15 }) ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-hd' }, _('History kept (days)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'number', 'id': 'apm-hd', 'min': '1', 'max': '90',
						'value': s.history_days || 30 }) ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-sm' },
					_('Flash snapshot every (minutes)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'number', 'id': 'apm-sm', 'min': '1', 'max': '240',
						'value': s.snapshot_minutes || 10 }) ])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-wl' },
					_('Whitelist mode (block new devices)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'type': 'checkbox', 'id': 'apm-wl',
						checked: (Number(s.whitelist) === 1 || Number(s.whitelist) === 2) ? 'checked' : null }),
					E('div', { 'class': 'apm-hint' },
						_('Every wifi device can still join and reach the LAN, but only allowed devices get internet. A phone with a randomised MAC becomes a new device, so it loses internet until you allow it.'))
				])
			]),
			E('div', { 'class': 'cbi-value', 'id': 'apm-wl-state', style: (Number(s.whitelist) === 2) ? '' : 'display:none' }, [
				E('div', { 'class': 'apm-hint apm-hint--warn' },
					Number(s.whitelist) === 2
						? _('No gateway found: whitelist mode is not filtering yet. Set a default route or set the option to forced.')
						: '')
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title', 'for': 'apm-ign' },
					_('Hidden MACs (space separated)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('textarea', { 'id': 'apm-ign', 'rows': '2',
						placeholder: _('e.g. 55:66:77:88:99:aa') }, s.ignored_macs || '') ])
			]),
			E('div', { 'class': 'apm-inline', style: 'margin-top:8px' }, [
				E('button', { 'class': 'apm-btn apm-btn--go', 'click': function () {
					var payload = {
						enabled: document.getElementById('apm-en').checked ? 1 : 0,
						interval: parseInt(document.getElementById('apm-int').value, 10) || 15,
						history_days: parseInt(document.getElementById('apm-hd').value, 10) || 30,
						snapshot_minutes: parseInt(document.getElementById('apm-sm').value, 10) || 10,
						ignored_macs: document.getElementById('apm-ign').value.trim(),
						whitelist: document.getElementById('apm-wl').checked ? 1 : 0
					};
					ui.hideModal();
					callSettings(payload).then(function () { return self.flush(); });
				} }, _('Save')),
				E('button', { 'class': 'apm-btn', 'click': function () { ui.hideModal(); } }, _('Cancel'))
			])
		]));
	}
});
