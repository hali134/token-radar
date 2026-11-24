// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs, its confidence signal and the protocol's farm plan. No network: every byte it shows is
// in data.js. Confidence is a second signal beside implied value: it says how much of the snapshot
// supports a row, and it never moves a rank.
(() => {
  'use strict';

  const DATA = window.RADAR;
  if (!DATA) return;
  const mount = document.getElementById('radar');
  const state = {
    q: '',
    category: 'all',
    chain: 'all',
    watchlistOnly: false,
    confOnly: false,
    tab: 'pre-token',
    sort: 'implied',
    dir: -1,
    selected: null,
  };

  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  const fmtUsd = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    if (Math.abs(n) >= 1e3) return `$${Math.round(n / 1e3)}K`;
    return usd.format(n);
  };
  const fmtPct = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
    return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
  };
  const fmtAge = (days) => {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return `${(days / 365).toFixed(1)}y`;
    return `${Math.max(0, Math.round(days))}d`;
  };
  const bandLabel = (band) => (band === 'high' ? 'High' : band === 'medium' ? 'Medium' : 'Low');

  // The model in one function: the page recomputes a row from the snapshot figures and checks the
  // number board.json carries, so the page's code and the board's data are visibly the same arithmetic.
  const impliedOf = (row, model) => {
    const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d ?? 0));
    const growthMult = 1 + (growth / 100) * model.growth_weight;
    const age = row.age_days ?? model.unknown_age_days;
    const maturity = model.maturity_floor + model.maturity_range * Math.sqrt(Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days);
    return Math.max(1, Math.round(row.tvl_usd * model.base_multiple * growthMult * maturity));
  };

  // A small element builder: h('div', { class: 'x', onclick: fn }, 'text', childNode, [more]).
  const h = (tag, props, ...kids) => {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    for (const kid of kids) {
      if (kid === null || kid === undefined || kid === false) continue;
      if (Array.isArray(kid)) kid.forEach((c) => { if (c) node.appendChild(c); });
      else if (typeof kid === 'string' || typeof kid === 'number') node.appendChild(document.createTextNode(String(kid)));
      else node.appendChild(kid);
    }
    return node;
  };

  // ---------------------------------------------------------------- the farm plan
  //
  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL and
  // age decide the action, the capital, the hold and every cost and time. The rules are a table,
  // first match wins, each rule naming the category words it answers to and the sentence it writes.
  // No name is special-cased. Gas is priced by the chain the protocol runs on: Ethereum costs
  // dollars a transaction, a layer 2 costs cents, and Solana-class chains cost almost nothing.

  const chainOf = (p) => (p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain');

  const capitalFor = (p) => {
    const tiers = [[5e9, 250], [1e9, 150], [1e8, 100], [25e6, 75]];
    for (const [floor, capital] of tiers) if (p.tvl_usd >= floor) return capital;
    return 50;
  };

  const holdDaysFor = (age) => {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  };

  const gasFor = (chain) => {
    const tiers = [
      { chains: ['ethereum'], label: 'about $8 to $15 of gas per transaction' },
      { chains: ['bitcoin', 'tron', 'binance'], label: 'about $1 to $3 of gas per transaction' },
      { chains: ['solana', 'sui', 'aptos', 'stellar', 'hyperliquid l1', 'monad', 'movement', 'sei'], label: 'a few cents of gas per transaction' },
    ];
    const c = (chain || '').toLowerCase();
    for (const tier of tiers) if (tier.chains.includes(c)) return tier.label;
    return 'under $0.50 of gas per transaction';
  };

  const ACTION_RULES = [
    { keys: ['risk curator', 'curator', 'allocator'], write: (name, capital, chain) => `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the shares.` },
    { keys: ['rwa'], write: (name, capital, chain) => `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it.` },
    { keys: ['basis trad'], write: (name, capital, chain) => `Deposit $${capital} of USDC into ${name}'s basis-trading strategy on ${chain}.` },
    { keys: ['uncollateralized'], write: (name, capital, chain) => `Lend $${capital} of USDC through ${name} on ${chain} and keep the loan open.` },
    { keys: ['lend', 'cdp', 'collateral'], write: (name, capital, chain) => `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.` },
    { keys: ['liquidity manager'], write: (name, capital, chain) => `Deposit $${capital} into a ${name} managed liquidity position on ${chain}.` },
    { keys: ['leveraged farm', 'yield aggregator', 'yield', 'farm'], write: (name, capital, chain) => `Deposit $${capital} of USDC into ${name}'s main yield position on ${chain} and keep it open.` },
    { keys: ['dex'], write: (name, capital, chain) => `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.` },
    { keys: ['restak'], write: (name, capital, chain) => `Restake $${capital} of the chain's staking asset through ${name} and keep the receipt.` },
    { keys: ['staking'], write: (name, capital, chain) => `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.` },
    { keys: ['perpetual', 'derivative', 'interest rate'], write: (name, capital, chain) => `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.` },
    { keys: ['prediction'], write: (name, capital, chain) => `Fund $${capital} and place one market position on ${name}.` },
    { keys: ['insurance'], write: (name, capital, chain) => `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.` },
    { keys: ['payment', 'card'], write: (name, capital, chain) => `Spend $${capital} through ${name} on ${chain} and keep the receipts.` },
    { keys: ['cedefi'], write: (name, capital, chain) => `Deposit $${capital} of USDC into ${name}'s CeDeFi vault on ${chain}.` },
    { keys: ['index'], write: (name, capital, chain) => `Buy $${capital} of the ${name} index on ${chain} and hold it.` },
    { keys: ['otc'], write: (name, capital, chain) => `Place one $${capital} order through ${name} on ${chain}.` },
    { keys: ['governance'], write: (name, capital, chain) => `Deposit $${capital} and vote once on ${name}'s governance.` },
    { keys: ['stable'], write: (name, capital, chain) => `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.` },
    { keys: ['bridge', 'cross chain'], write: (name, capital, chain) => `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.` },
    { keys: ['btc', 'anchor'], write: (name, capital, chain) => `Deposit $${capital} of BTC through ${name} on ${chain} and keep the receipt.` },
    { keys: ['chain'], write: (name, capital, chain) => `Bridge $${capital} to ${name}'s chain and make one transaction a week in its app.` },
  ];

  const actionFor = (p, capital, chain) => {
    const c = (p.category || '').toLowerCase();
    for (const rule of ACTION_RULES) {
      if (rule.keys.some((k) => c.includes(k))) return rule.write(p.name, capital, chain);
    }
    return `Deposit $${capital} of USDC into ${p.name} on ${chain} and keep the position open.`;
  };

  const stepText = (step) => {
    let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
    if (s.length > 600) s = `${s.slice(0, 596)}...`;
    if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
    return s;
  };

  const farmSteps = (p) => {
    const chain = chainOf(p);
    const capital = capitalFor(p);
    const hold = holdDaysFor(p.age_days);
    const gas = gasFor(chain);
    const lc = chain.toLowerCase();
    const weekly = lc === 'ethereum' ? 'about $8 of gas a week' : (lc === 'bitcoin' || lc === 'tron' || lc === 'binance') ? 'about $2 of gas a week' : 'under $0.50 of gas a week';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: gas, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: `$${capital} of capital and ${gas}`, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: weekly, time: '10 minutes a week' },
      { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
    ].map(stepText);
  };

  // ---------------------------------------------------------------- state in the address bar

  const readHash = () => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (params.get('conf') === '1') state.confOnly = true;
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('tab')) state.tab = params.get('tab');
  };

  const writeHash = () => {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.confOnly) params.set('conf', '1');
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    const next = params.toString();
    if (next) window.history.replaceState(null, '', `#${next}`);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  // ---------------------------------------------------------------- filtering and sorting

  const visibleRows = () => {
    const q = state.q.trim().toLowerCase();
    return DATA.rows.filter((r) => {
      if (state.watchlistOnly && !r.watchlist) return false;
      if (state.confOnly && r.confidence_band !== 'high') return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some((c) => c === state.chain)) return false;
      if (!q) return true;
      const hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.includes(q);
    });
  };

  const sortedRows = (list) => {
    const key = state.sort;
    return list.slice().sort((a, b) => {
      let av;
      let bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d ?? -Infinity; bv = b.change_7d ?? -Infinity; }
      else if (key === 'age') { av = a.age_days ?? Infinity; bv = b.age_days ?? Infinity; }
      else if (key === 'confidence') { av = a.confidence; bv = b.confidence; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  };

  const top10Total = () => DATA.rows.slice(0, 10).reduce((n, r) => n + r.implied_value_usd, 0);

  // ---------------------------------------------------------------- sections

  const hero = () => h('header', { class: 'hero' },
    h('div', { class: 'hero-in' },
      h('div', { class: 'top' },
        h('div', { class: 'brand' }, h('span', { class: 'ring' }), h('span', { class: 'brand-name', text: 'Token Radar' })),
        h('div', { class: 'top-meta' },
          h('span', { text: `Snapshot ${DATA.as_of}` }),
          h('span', { text: 'DefiLlama protocol index' }),
          h('span', { text: `${DATA.model_version} model` }),
        ),
      ),
      h('h1', null, 'Which pre-token protocol is ', h('em', { text: 'worth farming next' }), '?'),
      h('p', { class: 'lede' },
        'The watchlist is the floor: every protocol with at least ', h('b', { text: `$${Math.round(DATA.floor_usd / 1e6)}M` }),
        ' of TVL and no token on record. The early radar adds ', h('b', { text: String(DATA.early_size) }),
        ' more below that floor, each one a launch of its own, never a wrapped or staked product. Implied value is a model, not a promise.',
      ),
      h('div', { class: 'facts' },
        h('div', { class: 'fact' }, h('b', { text: `${DATA.watchlist_size} / ${DATA.watchlist_size}` }), h('span', { text: 'Watchlist covered' })),
        h('div', { class: 'fact' }, h('b', { text: String(DATA.board_size) }), h('span', { text: 'Pre-token rows scored' })),
        h('div', { class: 'fact' }, h('b', { text: String(DATA.early_size) }), h('span', { text: 'Early rows below the floor' })),
        h('div', { class: 'fact' }, h('b', { text: fmtUsd(top10Total()) }), h('span', { text: 'Top 10 implied value' })),
      ),
    ),
  );

  // How the board's confidence scores fall: three counts and the mean, as a stacked bar.
  const confidenceStrip = () => {
    const c = DATA.confidence;
    const total = Math.max(1, DATA.board_size);
    const pct = (n) => Math.max(n === 0 ? 0 : 4, Math.round((n / total) * 100));
    return h('section', { class: 'conf-strip', 'aria-label': 'Confidence across the board' },
      h('div', { class: 'conf-strip-head' },
        h('h2', { text: 'Confidence across the board' }),
        h('span', { class: 'sub', text: `Mean score ${c.mean} of 100 · ${c.high} high, ${c.medium} medium, ${c.low} low` }),
      ),
      h('div', { class: 'conf-bar', role: 'img', 'aria-label': `${c.high} high, ${c.medium} medium, ${c.low} low confidence rows` },
        h('i', { class: 'seg high', style: `width:${pct(c.high)}%` }),
        h('i', { class: 'seg medium', style: `width:${pct(c.medium)}%` }),
        h('i', { class: 'seg low', style: `width:${pct(c.low)}%` }),
      ),
      h('p', { class: 'note', text: 'Confidence says how much of the snapshot supports a row: size of the lock, days listed, how calm the seven-day print is, and what the record actually carries. It never moves a rank.' }),
    );
  };

  const controls = () => {
    const categories = [...new Set(DATA.rows.map((r) => r.category || 'Other'))].sort();
    const chains = [...new Set(DATA.rows.flatMap((r) => r.chains || []))].sort();
    const search = h('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', () => { state.q = search.value; writeHash(); render(); });
    const catSelect = h('select', { id: 'category', 'aria-label': 'Filter by category' },
      h('option', { value: 'all', text: 'All categories' }),
      categories.map((c) => h('option', { value: c, text: c, selected: c === state.category ? 'selected' : null })),
    );
    catSelect.addEventListener('change', () => { state.category = catSelect.value; writeHash(); render(); });
    const chainSelect = h('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      h('option', { value: 'all', text: 'All chains' }),
      chains.map((c) => h('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null })),
    );
    chainSelect.addEventListener('change', () => { state.chain = chainSelect.value; writeHash(); render(); });
    const wl = h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: state.watchlistOnly ? 'checked' : null, 'aria-label': 'Watchlist only' }),
      'Watchlist only',
    );
    wl.querySelector('input').addEventListener('change', (e) => { state.watchlistOnly = e.target.checked; writeHash(); render(); });
    const conf = h('label', { class: 'check' },
      h('input', { type: 'checkbox', checked: state.confOnly ? 'checked' : null, 'aria-label': 'High confidence only' }),
      'High confidence only',
    );
    conf.querySelector('input').addEventListener('change', (e) => { state.confOnly = e.target.checked; writeHash(); render(); });
    const pre = h('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: () => { state.tab = 'pre-token'; render(); } });
    const live = h('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: () => { state.tab = 'live'; render(); } });
    return h('div', { class: 'controls' },
      h('div', { class: 'field' }, h('label', { for: 'q', text: 'Search' }), search),
      h('div', { class: 'field' }, h('label', { for: 'category', text: 'Category' }), catSelect),
      h('div', { class: 'field' }, h('label', { for: 'chain', text: 'Chain' }), chainSelect),
      h('div', { class: 'field' }, h('label', { text: 'Scope' }), wl),
      h('div', { class: 'field' }, h('label', { text: 'Confidence' }), conf),
      h('div', { class: 'field' }, h('span', { class: 'sub', text: 'Token status' }), h('div', { class: 'tabs' }, pre, live)),
      h('span', { class: 'count', text: state.tab === 'pre-token' ? `${visibleRows().length} rows shown` : `${DATA.live.length} live-token protocols` }),
    );
  };

  const sortHeader = (key, label) => h('th', { scope: 'col' },
    h('button', { type: 'button', onclick: () => { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
      label,
      state.sort === key ? h('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null,
    ),
  );

  const confidenceCell = (r) => h('td', null,
    h('div', { class: 'conf' },
      h('div', { class: 'conf-bar small', 'aria-hidden': 'true' }, h('i', { class: `seg ${r.confidence_band}`, style: `width:${Math.max(4, r.confidence)}%` })),
      h('span', { class: 'num', text: `${r.confidence} · ${bandLabel(r.confidence_band)}` }),
    ),
  );

  const boardTable = () => {
    const list = sortedRows(visibleRows());
    if (list.length === 0) {
      return h('div', { class: 'panel' }, h('div', { class: 'empty' },
        h('h2', { text: 'No protocol matches that filter' }),
        h('p', { text: 'Clear the search or pick another category to see the board again.' }),
        h('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: () => { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; state.confOnly = false; writeHash(); render(); } }),
      ));
    }
    const max = list[0].implied_value_usd || 1;
    const tbody = h('tbody');
    for (const r of list) {
      const growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      const growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      const tr = h('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: () => openDetail(r.slug),
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } },
      },
        h('td', null, h('span', { class: `rank${r.rank <= 3 ? ' top' : ''}`, text: String(r.rank) })),
        h('td', null, h('div', { class: 'name' },
          h('b', { text: r.name }),
          h('span', { class: 'sub', text: `${r.category || 'Other'} on ${r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain'}` }),
        )),
        h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: `num ${growthClass}`, text: growth }),
        h('td', { class: 'num', text: fmtAge(r.age_days) }),
        h('td', null, h('div', { class: 'implied' },
          h('div', { class: 'bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.max(3, Math.round((r.implied_value_usd / max) * 100))}%` })),
          h('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
        )),
        confidenceCell(r),
        h('td', null, r.watchlist ? h('span', { class: 'tag', text: 'watchlist' }) : h('span', { class: 'status', text: 'no token' })),
      );
      tbody.appendChild(tr);
    }
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, its confidence and its farm plan.' }),
          h('thead', null, h('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('confidence', 'Confidence'),
            h('th', { scope: 'col', text: 'Token' }),
          )),
          tbody,
        ),
      ),
    );
  };

  const liveTable = () => {
    const tbody = h('tbody');
    for (const r of DATA.live) {
      tbody.appendChild(h('tr', null,
        h('td', null, h('span', { class: 'status live', text: 'live' })),
        h('td', null, h('div', { class: 'name' }, h('b', { text: r.name }), h('span', { class: 'sub', text: `${r.category || 'Other'} on ${r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain'}` }))),
        h('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        h('td', { class: `num ${r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'}`, text: fmtPct(r.change_7d) }),
        h('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        h('td', null, h('span', { class: 'status live', text: 'already trades' })),
      ));
    }
    return h('div', { class: 'panel' },
      h('div', { class: 'table-wrap' },
        h('table', null,
          h('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          h('thead', null, h('tr', null, h('th', { scope: 'col', text: 'Status' }), h('th', { scope: 'col', text: 'Protocol' }), h('th', { scope: 'col', text: 'TVL' }), h('th', { scope: 'col', text: '7d' }), h('th', { scope: 'col', text: 'Market cap' }), h('th', { scope: 'col', text: 'Token' }))),
          tbody,
        ),
      ),
    );
  };

  const modelPanel = () => {
    const m = DATA.model;
    return h('section', { class: 'panel model' },
      h('h2', { text: 'How implied value is computed' }),
      h('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      h('div', { class: 'formula' },
        `implied = round( tvl_usd x ${m.base_multiple} x (1 + clamp(change_7d, ${m.growth_floor}, ${m.growth_cap}) / 100 x ${m.growth_weight}) x (${m.maturity_floor} + sqrt(min(age_days, ${m.maturity_days}) / ${m.maturity_days}) x ${m.maturity_range}) )`,
      ),
      h('p', { class: 'note', text: `A launch typically prices at a fraction of the value already locked in the protocol, so the base is TVL times a conservative quarter. Growth is clamped hard at both ends because a seven-day spike is usually one event, not a trend: this snapshot\u2019s largest jump is +4,448%, and no launch is worth forty-five times another on one week\u2019s print. Maturity rewards survival with diminishing returns: a protocol that has run a year with no token has proven itself and faces real pressure to launch, while the fourth year adds less than the first, so the curve is a square root, not a straight line. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses ${m.unknown_age_days} days.` }),
      h('p', { class: 'note', text: `Confidence is separate from implied value and never moves a rank: it adds four parts out of 100 — size of the lock (0–40), days listed (0–25), how calm the seven-day print is (0–20), and what the record actually carries (0–15). High is 70 and above, medium is 40 to 69, low is below 40. The board separates what trades from what does not: the ${DATA.live_size} live-token protocols below carry their market caps, never a model value. A protocol is said to record no token, never that it has none: DefiLlama\u2019s record is not proof, and a wrapped or staked product of a token that trades is no launch of its own.` }),
    );
  };

  const dialog = h('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', () => { state.selected = null; writeHash(); });

  const openDetail = (slug) => {
    const row = DATA.rows.find((r) => r.slug === slug);
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    const steps = farmSteps(row);
    const parts = row.confidence_parts || {};
    const recomputed = impliedOf(row, DATA.model);
    dialog.appendChild(h('div', { class: 'detail-head' },
      h('div', null,
        h('span', { class: 'detail-kicker', text: `Rank ${row.rank} of ${DATA.board_size}${row.watchlist ? '  ·  watchlist' : '  ·  early radar'}` }),
        h('h2', { id: 'detail-title', text: row.name }),
        h('p', { class: 'sub', text: `${row.category || 'Other'} on ${row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain'}` }),
      ),
      h('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: () => dialog.close() }),
    ));
    dialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Implied value' }),
      h('div', { class: 'equation' },
        h('div', null, h('span', { text: 'TVL' }), h('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        h('div', null, h('span', { text: 'Seven-day growth' }), h('b', { class: 'num', text: fmtPct(row.change_7d) })),
        h('div', null, h('span', { text: 'Age with no token' }), h('b', { class: 'num', text: fmtAge(row.age_days) })),
        h('div', null, h('span', { text: 'Growth multiplier' }), h('b', { class: 'num', text: String(row.growth_multiplier) })),
        h('div', null, h('span', { text: 'Maturity multiplier' }), h('b', { class: 'num', text: String(row.maturity_multiplier) })),
        h('div', null, h('span', { text: 'Implied value' }), h('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
      ),
      h('p', { class: 'sub', text: `Model ${DATA.model_version}: the same function scores every protocol. The page recomputes this row as ${fmtUsd(recomputed)}${recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.'} This is an estimate, not a price.` }),
    ));
    dialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: `Confidence: ${row.confidence} of 100, ${bandLabel(row.confidence_band)}` }),
      h('div', { class: 'conf-bar', 'aria-hidden': 'true' },
        h('i', { class: `seg ${row.confidence_band}`, style: `width:${Math.max(4, row.confidence)}%` }),
      ),
      h('div', { class: 'equation' },
        h('div', null, h('span', { text: 'Size of the lock (0–40)' }), h('b', { class: 'num', text: String(parts.size ?? 'n/a') })),
        h('div', null, h('span', { text: 'Days listed (0–25)' }), h('b', { class: 'num', text: String(parts.history ?? 'n/a') })),
        h('div', null, h('span', { text: 'Calm seven-day print (0–20)' }), h('b', { class: 'num', text: String(parts.stability ?? 'n/a') })),
        h('div', null, h('span', { text: 'What the record carries (0–15)' }), h('b', { class: 'num', text: String(parts.completeness ?? 'n/a') })),
      ),
      h('p', { class: 'sub', text: 'Confidence never moves a rank: it says how much of the snapshot supports this row, so a high implied value on a thin record reads differently from the same value on a thick one.' }),
    ));
    dialog.appendChild(h('section', { class: 'detail-section' },
      h('h3', { text: 'Farm plan' }),
      h('ol', { class: 'steps' }, steps.map((s) => {
        const at = s.indexOf(' Cost: ');
        const action = at >= 0 ? s.slice(0, at) : s;
        const tail = at >= 0 ? s.slice(at + 1) : '';
        return h('li', null, h('b', { text: action }), h('span', { class: 'cost', text: tail }));
      })),
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  };

  const render = () => {
    mount.textContent = '';
    mount.appendChild(hero());
    const shell = h('div', { class: 'shell' });
    if (state.tab === 'pre-token') shell.appendChild(confidenceStrip());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(h('p', { class: 'footnote', text: `Source: DefiLlama protocol index, snapshot ${DATA.as_of}. Implied values are this radar\u2019s own model, not a price and not a prediction that any token is issued. Farm plans are a starting point: check the protocol\u2019s own pages before you move funds.` }));
    mount.appendChild(shell);
    mount.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) mount.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  };

  readHash();
  render();
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
