function initLogViewer(config) {
    var LEVELS = ['INFO', 'DEBUG', 'WARNING', 'ERROR'];
    var active = new Set(config.defaultLevels);

    document.querySelector('h1').textContent = config.heading;

    var navLink = document.getElementById('other-page-link');
    navLink.href = config.otherPageHref;
    navLink.textContent = config.otherPageLabel;

    var fEl = document.getElementById('lvl-filters');
    LEVELS.forEach(function(lv) {
        var b = document.createElement('button');
        b.className = 'lvl-btn';
        b.dataset.level = lv;
        b.textContent = lv;
        if (!active.has(lv)) b.classList.add('off');
        b.onclick = function() {
            if (active.has(lv)) {
                if (active.size > 1) { active.delete(lv); b.classList.add('off'); }
            } else {
                active.add(lv); b.classList.remove('off');
            }
            render();
        };
        fEl.appendChild(b);
    });

    function getPrefix(msg) {
        var m = (msg || '').match(/^\[([A-Z0-9_]+)\]/);
        return m ? m[1] : null;
    }

    function timeStr(ts) {
        return ts ? ts.split(' ')[1].split(',')[0] : '';
    }

    function esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function msgHtml(msg) {
        return esc(msg || '').replace(/(\[[A-Z0-9_]+\])/g, '<span class="prefix">$1</span>');
    }

    function paramsSummary(args) {
        if (!args) return '';
        var parts = [];
        if (args.tileType) parts.push('tile=' + args.tileType);
        if (args.calcMode) parts.push('mode=' + args.calcMode);
        if (args.nt1 != null) parts.push('tiles=(' + args.nt1 + ',' + args.nt2 + ',' + args.nt3 + ')');
        if (args.g1 != null) parts.push('g=(' + args.g1 + ',' + args.g2 + ')');
        return parts.join('  ');
    }

    var allEntries = [];

    function entryHtml(e, hideSid) {
        var lv = e.level || 'INFO';
        var lc = lv === 'WARNING' ? 'W' : lv === 'ERROR' ? 'E' : '';
        var sid = (e.sid && !hideSid)
            ? '<span class="sid-pill" title="' + esc(e.sid) + '">' + esc(e.sid.substring(0, 8)) + '</span>'
            : '';
        var calcLogExtra = e.image
            ? '<div class="calc-log-extra">'
                + '<a href="/calc-log-image/' + esc(e.image.split('/').pop()) + '" target="_blank">'
                + '<img class="calc-log-thumb" src="/calc-log-image/' + esc(e.image.split('/').pop()) + '" alt="snapshot"></a>'
                + (e.filename ? '<span class="calc-log-filename">' + esc(e.filename) + '</span>' : '')
                + (e.args ? '<span class="calc-log-params">' + esc(paramsSummary(e.args)) + '</span>' : '')
                + '</div>'
            : '';
        var excOpenAttr = config.excBlocksExpandedByDefault ? ' open' : '';
        var excBlock = e.exc
            ? (config.excBlocksExpandedByDefault
                ? '<pre class="exc-block">' + esc(e.exc) + '</pre>'
                : '<details' + excOpenAttr + '><summary style="cursor:pointer;color:#e06c75;font-size:11px;margin:3px 0 0 90px;">Exception</summary><pre class="exc-block">' + esc(e.exc) + '</pre></details>')
            : '';
        return '<div class="log-entry ' + lc + '">'
            + '<div class="log-line">'
            + '<span class="ts">' + esc(timeStr(e.ts)) + '</span>'
            + '<span class="badge ' + lv + '">' + lv + '</span>'
            + '<span class="msg">' + msgHtml(e.msg) + '</span>'
            + sid
            + '</div>'
            + calcLogExtra
            + excBlock
            + '</div>';
    }

    function render() {
        var q = (document.getElementById('search').value || '').toLowerCase();
        var sort = document.getElementById('sort').value;
        var group = document.getElementById('group').value;
        var out = document.getElementById('log-output');

        var filtered = allEntries.filter(function(e) {
            return active.has(e.level || 'INFO')
                && (!q || (e.msg || '').toLowerCase().includes(q) || (e.sid || '').toLowerCase().includes(q));
        });

        if (sort === 'desc') filtered = filtered.slice().reverse();

        document.getElementById('stats').textContent = filtered.length + ' / ' + allEntries.length + ' entries';

        if (!filtered.length) {
            out.innerHTML = '<div class="empty">No matching entries</div>';
            return;
        }

        var atBottom = out.scrollHeight - out.scrollTop - out.clientHeight < 40;

        if (group === 'none') {
            out.innerHTML = filtered.map(function(e){ return entryHtml(e, false); }).join('');
        } else if (group === 'sid') {
            var buckets = new Map();
            filtered.forEach(function(e) {
                var k = e.sid || '(no sid)';
                if (!buckets.has(k)) buckets.set(k, []);
                buckets.get(k).push(e);
            });
            var html = '';
            buckets.forEach(function(rows, sid) {
                html += '<div class="group-hdr">SID: ' + esc(sid) + '&nbsp;&nbsp;<span>' + rows.length + ' entries</span></div>';
                html += rows.map(function(e){ return entryHtml(e, true); }).join('');
            });
            out.innerHTML = html;
        } else if (group === 'prefix') {
            var buckets2 = new Map();
            filtered.forEach(function(e) {
                var k = getPrefix(e.msg) || '(no tag)';
                if (!buckets2.has(k)) buckets2.set(k, []);
                buckets2.get(k).push(e);
            });
            var html2 = '';
            buckets2.forEach(function(rows, tag) {
                html2 += '<div class="group-hdr">[' + esc(tag) + ']&nbsp;&nbsp;<span>' + rows.length + ' entries</span></div>';
                html2 += rows.map(function(e){ return entryHtml(e, false); }).join('');
            });
            out.innerHTML = html2;
        }

        if (atBottom) out.scrollTop = out.scrollHeight;
    }

    document.getElementById('search').oninput = render;
    document.getElementById('sort').onchange = render;
    document.getElementById('group').onchange = render;

    var socket = io();

    socket.on('connect', function() {
        allEntries = [];
        document.getElementById('log-output').innerHTML = '<p style="padding:12px;color:#4b5263;">Connected. Streaming…</p>';
    });

    socket.on('log_update', function(msg) {
        var entry;
        try {
            entry = JSON.parse(msg.data);
        } catch(e) {
            entry = { msg: msg.data, level: 'INFO', ts: '' };
        }
        allEntries.push(entry);
        render();
    });

    socket.on('log_error', function(msg) {
        allEntries.push({ msg: 'SERVER ERROR: ' + msg.data, level: 'ERROR', ts: '' });
        render();
    });

    socket.on('disconnect', function() {
        allEntries.push({ msg: 'Disconnected. Refresh to reconnect.', level: 'WARNING', ts: '' });
        render();
    });
}
