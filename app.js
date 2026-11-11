
'use strict';

// ============================================================
// BioBloom — Complete app.js
// Existing dashboard + Supabase IoT + simulated pH
// Uses the existing index.html and style.css
// ============================================================

const KEY = 'biobloom_compost_lab_v2';

const BINS = [
  {
    id: 'water',
    num: '01',
    name: 'ถังน้ำธรรมดา',
    short: 'น้ำธรรมดา',
    stage: 'CONTROL SAMPLE',
    tag: 'ถังอ้างอิง',
    color: '#67afbe',
    base: { ph: 7.0, temperature: 27, humidity: 58 },
    insight: 'pH 7 เป็นตัวอย่างค่าเป็นกลาง น้ำจริงอาจมี pH แตกต่างกัน'
  },
  {
    id: 'day1',
    num: '02',
    name: 'ถังหมัก 1 วัน',
    short: 'หมัก 1 วัน',
    stage: 'DAY 01 / ACTIVE',
    tag: 'เริ่มกระบวนการ',
    color: '#dba26d',
    base: { ph: 5.2, temperature: 35, humidity: 72 },
    insight: 'ระยะแรกของการหมักอาจเกิดกรดอินทรีย์ แต่ค่า pH จริงขึ้นอยู่กับสูตรน้ำหมัก'
  },
  {
    id: 'mature',
    num: '03',
    name: 'ถังหมักสุกแล้ว',
    short: 'หมักสุก',
    stage: 'MATURE / CURED',
    tag: 'ตัวอย่างหมักสุก',
    color: '#77a06a',
    base: { ph: 3.8, temperature: 29, humidity: 61 },
    insight: 'pH 3.8 เป็นเพียงตัวอย่างสำหรับน้ำหมักบางสูตร ไม่ใช่ผลวัดจริงหรือหลักฐานว่าน้ำหมักพร้อมใช้'
  }
];

// ============================================================
// Helpers
// ============================================================

const $ = id => document.getElementById(id);

function num(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function f(value, digits = 1) {
  const n = num(value);
  return n === null ? '--' : n.toFixed(digits);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fmtDate(value) {
  if (!value) return 'ยังไม่มีข้อมูล';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'ไม่ทราบเวลา';
  return d.toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function cleanCode(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function seed(bin) {
  return Array.from({ length: 12 }, (_, i) => ({
    ph: +(
      bin.base.ph +
      Math.sin(i * 0.7 + Number(bin.num)) * 0.12
    ).toFixed(2),
    temperature: bin.base.temperature,
    humidity: bin.base.humidity,
    recorded_at: new Date(
      Date.now() - (11 - i) * 3600000
    ).toISOString()
  }));
}

// ============================================================
// State
// ============================================================

function blankState() {
  return {
    mode: 'sim',
    page: 'dashboard',
    selected: 'water',
    sim: Object.fromEntries(
      BINS.map(b => [
        b.id,
        {
          ...b.base,
          recorded_at: new Date().toISOString()
        }
      ])
    ),
    hist: Object.fromEntries(
      BINS.map(b => [b.id, seed(b)])
    ),
    config: {
      url: '',
      key: '',
      codes: {
        water: 'BIN001',
        day1: 'BIN002',
        mature: 'BIN003'
      }
    }
  };
}

let state = blankState();
let live = {};
let busy = false;
let liveError = '';
let timer = null;

try {
  const old = JSON.parse(localStorage.getItem(KEY));

  if (old) {
    if (['sim', 'live'].includes(old.mode)) {
      state.mode = old.mode;
    }

    if (BINS.some(b => b.id === old.selected)) {
      state.selected = old.selected;
    }

    if (['dashboard', 'history', 'connect', 'learn'].includes(old.page)) {
      state.page = old.page;
    }

    if (old.config) {
      state.config.url = String(old.config.url || '');
      state.config.key = String(old.config.key || '');

      for (const b of BINS) {
        state.config.codes[b.id] =
          String(old.config.codes?.[b.id] || state.config.codes[b.id]);
      }
    }

    for (const b of BINS) {
      const s = old.sim?.[b.id];

      if (s && num(s.ph) !== null) {
        state.sim[b.id] = {
          ph: clamp(num(s.ph), 0, 14),
          temperature: num(s.temperature) ?? b.base.temperature,
          humidity: num(s.humidity) ?? b.base.humidity,
          recorded_at: s.recorded_at || new Date().toISOString()
        };
      }

      if (Array.isArray(old.hist?.[b.id])) {
        state.hist[b.id] = old.hist[b.id]
          .slice(-120)
          .filter(x => num(x.ph) !== null);
      }
    }
  }
} catch (error) {
  console.warn('Cannot load local settings:', error);
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Cannot save settings:', error);
  }
}

function stage() {
  return BINS.find(b => b.id === state.selected) || BINS[0];
}

function read(id) {
  if (state.mode === 'sim') return state.sim[id];
  return live[id]?.latest || null;
}

function rows(id) {
  if (state.mode === 'sim') return state.hist[id];
  return live[id]?.rows || [];
}

// pH is simulated, never measured by ESP8266.
// Keep it separate from real sensor readings.
function displayPH(id, reading) {
  if (state.mode === 'live') {
    return BINS.find(b => b.id === id)?.base.ph ?? null;
  }
  return num(reading?.ph);
}

function cat(ph) {
  if (ph === null) return 'ยังไม่มีข้อมูล';
  if (ph < 6) return 'มีความเป็นกรด';
  if (ph > 8) return 'มีความเป็นด่าง';
  return 'ใกล้เคียงเป็นกลาง';
}

// ============================================================
// Dashboard cards
// ============================================================

function makeCard(bin) {
  const reading = read(bin.id);
  const ph = displayPH(bin.id, reading);

  const button = document.createElement('button');
  button.type = 'button';
  button.className =
    'bin-card' + (state.selected === bin.id ? ' selected' : '');

  button.setAttribute(
    'aria-pressed',
    String(state.selected === bin.id)
  );

  const top = document.createElement('div');
  top.className = 'card-top';

  const name = document.createElement('div');

  const eye = document.createElement('div');
  eye.className = 'eyebrow';
  eye.textContent = 'BIN ' + bin.num + ' / ' + bin.stage;

  const heading = document.createElement('h3');
  heading.textContent = bin.name;

  const small = document.createElement('div');
  small.className = 'sub';
  small.textContent =
    state.mode === 'sim'
      ? 'ข้อมูลจำลอง'
      : 'เซนเซอร์จริง / pH จำลอง';

  name.append(eye, heading, small);

  const badge = document.createElement('span');
  badge.className =
    'status ' +
    (bin.id === 'water'
      ? 'blue'
      : bin.id === 'day1'
        ? 'amber'
        : '');

  badge.textContent =
    state.mode === 'sim'
      ? bin.tag
      : reading
        ? 'มีค่าจริง'
        : 'รอข้อมูล';

  top.append(name, badge);

  const body = document.createElement('div');
  body.className = 'tank-wrap';

  const tank = document.createElement('div');
  tank.className = 'tank ' + bin.id;

  tank.innerHTML = `
    <div class="tank-lid"></div>
    <div class="tank-shell">
      <div class="liquid">
        <div class="bubbles"></div>
      </div>
    </div>
    <div class="tank-base"></div>
  `;

  const phbox = document.createElement('div');
  phbox.className = 'card-ph';

  const label = document.createElement('small');
  label.textContent =
    state.mode === 'live' ? 'pH SIMULATION' : 'pH LEVEL';

  const big = document.createElement('b');
  big.textContent = f(ph);

  const status = document.createElement('em');
  status.textContent = cat(ph);

  phbox.append(label, big, status);
  body.append(tank, phbox);

  const foot = document.createElement('div');
  foot.className = 'card-bottom';

  const temp = document.createElement('span');
  temp.textContent = 'อุณหภูมิ ';

  const tv = document.createElement('strong');
  tv.textContent = f(reading?.temperature) + '°C';
  temp.append(tv);

  const humidity = document.createElement('span');
  humidity.textContent = 'ความชื้น ';

  const hv = document.createElement('strong');
  hv.textContent = f(reading?.humidity, 0) + '%';
  humidity.append(hv);

  foot.append(temp, humidity);

  const timestamp = document.createElement('div');
  timestamp.className = 'card-time';

  timestamp.textContent =
    state.mode === 'sim'
      ? '● DEMO / ทดลองปรับค่าได้'
      : reading
        ? '● ล่าสุด ' + fmtDate(reading.recorded_at)
        : '○ ยังไม่ได้รับข้อมูลจากบอร์ด';

  button.append(top, body, foot, timestamp);

  button.onclick = () => {
    state.selected = bin.id;
    save();
    render();
  };

  return button;
}

function renderCards() {
  $('bins').replaceChildren(...BINS.map(makeCard));
}

// ============================================================
// pH chart
// ============================================================

function drawChart() {
  const root = $('chart');
  root.replaceChildren();

  const ns = 'http://www.w3.org/2000/svg';

  const W = 700;
  const H = 230;
  const left = 32;
  const right = 13;
  const top = 11;
  const bottom = 29;

  const svg = document.createElementNS(ns, 'svg');

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'แนวโน้มค่า pH ของสามถัง');

  function shape(tag, attrs, content) {
    const element = document.createElementNS(ns, tag);

    for (const [key, value] of Object.entries(attrs)) {
      element.setAttribute(key, value);
    }

    if (content !== undefined) {
      element.textContent = content;
    }

    return element;
  }

  const y = value =>
    top + ((14 - value) / 14) * (H - top - bottom);

  for (const value of [0, 3.5, 7, 10.5, 14]) {
    svg.append(
      shape('line', {
        x1: left,
        x2: W - right,
        y1: y(value),
        y2: y(value),
        stroke: value === 7 ? '#c3dabb' : '#e5ece3',
        'stroke-dasharray': value === 7 ? '4 5' : '0'
      })
    );

    svg.append(
      shape('text', {
        x: left - 8,
        y: y(value) + 4,
        'text-anchor': 'end',
        fill: '#9ba99c',
        'font-size': 11
      }, String(value))
    );
  }

  let hasData = false;

  for (const bin of BINS) {
    let values;

    if (state.mode === 'live') {
      // Demonstration line, not historical sensor data.
      const ph = displayPH(bin.id, null);
      values = ph === null ? [] : [ph, ph];
    } else {
      values = rows(bin.id)
        .filter(r => num(r.ph) !== null)
        .slice(-30)
        .map(r => num(r.ph));
    }

    if (!values.length) continue;

    hasData = true;

    const points = values.map((value, index) => {
      const ratio =
        values.length === 1
          ? 0.5
          : index / (values.length - 1);

      const x = left + ratio * (W - left - right);

      return `${x},${y(clamp(value, 0, 14))}`;
    }).join(' ');

    svg.append(
      shape('polyline', {
        points,
        fill: 'none',
        stroke: bin.color,
        'stroke-width': state.selected === bin.id ? 4 : 2.4,
        'stroke-opacity': state.selected === bin.id ? 1 : 0.62,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round'
      })
    );
  }

  svg.append(
    shape('text', {
      x: left,
      y: H - 5,
      fill: '#a6b2a6',
      'font-size': 11
    }, state.mode === 'live' ? 'ค่า pH ตัวอย่าง' : 'ข้อมูลเก่าสุด')
  );

  svg.append(
    shape('text', {
      x: W - right,
      y: H - 5,
      'text-anchor': 'end',
      fill: '#a6b2a6',
      'font-size': 11
    }, state.mode === 'live' ? 'ไม่ใช่ข้อมูลวัดจริง' : 'ล่าสุด')
  );

  root.append(svg);

  if (!hasData) {
    const note = document.createElement('div');
    note.className = 'empty';
    note.textContent = 'ยังไม่มีข้อมูลสำหรับสร้างกราฟ';
    root.append(note);
  }
}

// ============================================================
// Selected bin details
// ============================================================

function renderDetails() {
  const bin = stage();
  const reading = read(bin.id);
  const ph = displayPH(bin.id, reading);

  $('selected-name').textContent = bin.name;

  $('selected-source').textContent =
    state.mode === 'sim'
      ? 'ข้อมูลจำลอง'
      : 'เซนเซอร์จริง / pH จำลอง';

  $('stage-tag').textContent = bin.stage;
  $('ph-value').textContent = f(ph);
  $('ph-category').textContent = cat(ph);

  $('pointer').style.left =
    (clamp(ph ?? 7, 0, 14) / 14 * 100) + '%';

  $('pointer').style.display =
    ph === null ? 'none' : '';

  $('simulation-controls').classList.toggle(
    'hidden',
    state.mode !== 'sim'
  );

  $('live-controls').classList.toggle(
    'hidden',
    state.mode !== 'live'
  );

  $('sensor-mode').textContent =
    state.mode === 'sim' ? 'DEMO DATA' : 'BOARD DATA';

  $('value-temp').textContent = f(reading?.temperature);
  $('value-humidity').textContent = f(reading?.humidity, 0);

  $('value-raw').textContent =
    reading?.compost_moisture_raw == null
      ? '--'
      : String(reading.compost_moisture_raw);

  if (state.mode === 'sim') {
    $('value-relays').textContent = 'จำลองเท่านั้น';
  } else if (!reading) {
    $('value-relays').textContent = '--';
  } else {
    const fan =
      typeof reading.fan_status === 'boolean'
        ? reading.fan_status ? 'ON' : 'OFF'
        : '?';

    const pump =
      typeof reading.pump_status === 'boolean'
        ? reading.pump_status ? 'ON' : 'OFF'
        : '?';

    $('value-relays').textContent =
      `F:${fan} P:${pump}`;
  }

  $('insight-title').textContent =
    state.mode === 'sim'
      ? 'คำแนะนำจากข้อมูลตัวอย่าง'
      : reading
        ? 'ข้อมูลเซนเซอร์และ pH จำลอง'
        : 'รอข้อมูลจากอุปกรณ์';

  $('insight').textContent =
    state.mode === 'sim'
      ? bin.insight
      : reading
        ? 'อุณหภูมิ ความชื้น และสถานะรีเลย์มาจาก Supabase ส่วน pH เป็นข้อมูลสมมติ ไม่ใช่ค่าที่วัดจริง และไม่ใช้ยืนยันว่าน้ำหมักพร้อมใช้งาน'
        : 'ยังไม่มีข้อมูลเซนเซอร์สำหรับรหัส ' +
          state.config.codes[bin.id] +
          ' กรุณาตรวจสอบการเชื่อมต่อและข้อมูลใน sensor_readings';

  $('data-source').textContent =
    state.mode === 'sim'
      ? 'SOURCE: SIMULATED'
      : 'SENSORS: SUPABASE / pH: SIMULATED';

  $('updated').textContent =
    fmtDate(reading?.recorded_at);

  if (state.mode === 'sim') {
    const sim = state.sim[bin.id];

    $('slider-ph').value = sim.ph;
    $('slider-temp').value = sim.temperature;
    $('slider-humidity').value = sim.humidity;

    $('out-ph').textContent = f(sim.ph);
    $('out-temp').textContent = sim.temperature + '°C';
    $('out-humidity').textContent = sim.humidity + '%';
  }
}

// ============================================================
// Comparison
// ============================================================

function renderComparison() {
  const root = $('comparison');
  root.replaceChildren();

  for (const bin of BINS) {
    const ph = displayPH(bin.id, read(bin.id));

    const row = document.createElement('div');
    row.className = 'compare-item';

    const name = document.createElement('span');
    name.textContent = bin.short;

    const track = document.createElement('div');
    track.className = 'track';

    const bar = document.createElement('div');
    bar.className = 'bar';

    bar.style.width = ((ph ?? 0) / 14 * 100) + '%';
    bar.style.background = bin.color;

    track.append(bar);

    const value = document.createElement('b');
    value.textContent = f(ph);

    row.append(name, track, value);
    root.append(row);
  }
}

// ============================================================
// History
// ============================================================

function renderHistory() {
  const all = [];
  const filter = $('history-filter').value;

  for (const bin of BINS) {
    if (filter !== 'all' && filter !== bin.id) continue;

    for (const reading of rows(bin.id)) {
      all.push({
        bin: bin.name,
        ...reading
      });
    }
  }

  all.sort(
    (a, b) =>
      new Date(b.recorded_at) - new Date(a.recorded_at)
  );

  $('history-count').textContent =
    all.length + ' รายการ • ' +
    (state.mode === 'sim' ? 'ทดลอง' : 'บอร์ดจริง');

  const table = $('history-rows');
  table.replaceChildren();

  if (!all.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');

    td.colSpan = 6;
    td.className = 'empty';
    td.textContent = 'ยังไม่มีข้อมูลของถังนี้';

    tr.append(td);
    table.append(tr);
    return;
  }

  for (const reading of all.slice(0, 150)) {
    const tr = document.createElement('tr');

    const values = [
      fmtDate(reading.recorded_at),
      reading.bin,
      state.mode === 'sim'
        ? f(reading.ph)
        : 'ไม่มีค่าที่วัดจริง',
      f(reading.temperature) + ' °C',
      f(reading.humidity, 0) + ' %',
      state.mode === 'sim'
        ? 'ทดลอง'
        : 'บอร์ดจริง'
    ];

    for (const value of values) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }

    table.append(tr);
  }
}

// ============================================================
// Main rendering
// ============================================================

function render() {
  document.querySelectorAll('.view').forEach(element => {
    element.classList.toggle(
      'hidden',
      element.id !== state.page
    );
  });

  document.querySelectorAll('[data-page]').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.page === state.page
    );
  });

  document.querySelectorAll('[data-mode]').forEach(button => {
    button.classList.toggle(
      'active',
      button.dataset.mode === state.mode
    );
  });

  const titles = {
    dashboard: [
      'ภาพรวมระบบถังหมัก',
      'ห้องควบคุมและทดลองถังหมักอัจฉริยะ 3 ระยะ'
    ],
    history: [
      'ประวัติข้อมูล',
      'สำรวจการบันทึกข้อมูลย้อนหลังทั้ง 3 ถัง'
    ],
    connect: [
      'เชื่อมต่อบอร์ด IoT',
      'ตั้งค่ารับข้อมูลจริงจาก Supabase และอุปกรณ์ ESP8266 / ESP32'
    ],
    learn: [
      'ความรู้และอ้างอิง pH',
      'หลักการทางวิชาการสำหรับการทดลองและติดตามค่า pH'
    ]
  };

  $('page-title').textContent = titles[state.page][0];
  $('page-subtitle').textContent = titles[state.page][1];

  const phValues = BINS
    .map(b => displayPH(b.id, read(b.id)))
    .filter(value => value !== null);

  $('average').textContent = phValues.length
    ? f(phValues.reduce((a, b) => a + b, 0) / phValues.length)
    : '--';

  const activeCount = BINS.filter(
    b => read(b.id) !== null
  ).length;

  $('active-count').textContent =
    String(activeCount).padStart(2, '0') + '/03';

  $('active-sub').textContent =
    state.mode === 'sim'
      ? 'DEMO READINGS'
      : 'REAL READINGS';

  $('hero-mode').textContent =
    state.mode === 'sim'
      ? '● DEMO MODE — ข้อมูลจำลองเพื่อการศึกษา'
      : liveError
        ? '● BOARD MODE — ' + liveError
        : '● BOARD MODE — เซนเซอร์จริง / pH จำลอง';

  renderCards();
  renderDetails();
  drawChart();
  renderComparison();

  if (state.page === 'history') {
    renderHistory();
  }
}

// ============================================================
// Navigation and simulation
// ============================================================

function go(page) {
  state.page = page;
  save();
  render();

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

function switchMode(mode) {
  state.mode = mode;
  save();
  render();
  polling();
}

function simulate() {
  if (state.mode !== 'sim') return;

  const sim = state.sim[state.selected];

  sim.ph = +Number($('slider-ph').value).toFixed(1);
  sim.temperature = Number($('slider-temp').value);
  sim.humidity = Number($('slider-humidity').value);
  sim.recorded_at = new Date().toISOString();

  save();
  render();
}

function record() {
  if (state.mode !== 'sim') return;

  const sim = state.sim[state.selected];

  state.hist[state.selected].push({ ...sim });

  state.hist[state.selected] =
    state.hist[state.selected].slice(-120);

  save();
  render();

  $('record').textContent = '✓ บันทึกแล้ว';

  setTimeout(() => {
    $('record').textContent = '+ บันทึกค่าทดลอง';
  }, 1300);
}

function reset() {
  const bin = stage();

  state.sim[bin.id] = {
    ...bin.base,
    recorded_at: new Date().toISOString()
  };

  save();
  render();
}

// ============================================================
// Supabase configuration
// ============================================================

function configFromForm() {
  const url = $('url').value
    .trim()
    .replace(/\/+$/, '');

  const key = $('apikey').value.trim();

  const codes = Object.fromEntries(
    BINS.map(bin => [
      bin.id,
      $('code-' + bin.id).value.trim()
    ])
  );

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
    throw new Error(
      'Project URL ต้องอยู่ในรูป https://project.supabase.co'
    );
  }

  if (!key || /service_role|sb_secret_/i.test(key)) {
    throw new Error(
      'ต้องใช้ Publishable / anon key เท่านั้น'
    );
  }

  const normalizedCodes =
    Object.values(codes).map(cleanCode);

  if (
    normalizedCodes.some(code => !code) ||
    new Set(normalizedCodes).size !== 3
  ) {
    throw new Error(
      'รหัสบอร์ดทั้ง 3 ถังต้องไม่ว่างและไม่ซ้ำกัน'
    );
  }

  return { url, key, codes };
}

function message(text) {
  $('connection-message').textContent = text;
}

function reqHeaders(key) {
  const headers = {
    apikey: key,
    Accept: 'application/json'
  };

  if (!key.startsWith('sb_publishable_')) {
    headers.Authorization = 'Bearer ' + key;
  }

  return headers;
}

async function get(cfg, path) {
  const response = await fetch(
    cfg.url + '/rest/v1/' + path,
    {
      method: 'GET',
      headers: reqHeaders(cfg.key),
      cache: 'no-store'
    }
  );

  if (!response.ok) {
    const detail = await response.text();

    throw new Error(
      'HTTP ' + response.status + ': ' +
      detail.slice(0, 300)
    );
  }

  return response.json();
}

// ============================================================
// Bin matching
// ============================================================

function matchBin(bins, code) {
  const expected = cleanCode(code);

  return bins.find(
    bin => cleanCode(bin.device_code) === expected
  ) || null;
}

function matchSummary(bins, codes) {
  return BINS.map(bin => ({
    bin,
    code: cleanCode(codes[bin.id]),
    record: matchBin(bins, codes[bin.id])
  }));
}

async function loadBins(cfg) {
  const bins = await get(
    cfg,
    'bins?select=id,device_code,name&limit=100'
  );

  if (!Array.isArray(bins)) {
    throw new Error(
      'Supabase ไม่ได้ส่งรายการถังกลับมา'
    );
  }

  return bins;
}

// ============================================================
// Connection test
// ============================================================

async function test() {
  try {
    const cfg = configFromForm();

    message('กำลังทดสอบการเชื่อมต่อ...');

    const bins = await loadBins(cfg);
    const matches = matchSummary(bins, cfg.codes);

    const count = matches.filter(
      item => item.record !== null
    ).length;

    const details = matches.map(item => {
      return item.bin.num + ': ' +
        (item.record ? 'พบ' : 'ไม่พบ');
    }).join(' | ');

    const available = bins.map(
      bin => cleanCode(bin.device_code)
    );

    const expected = matches.map(
      item => item.code
    );

    console.table(
      matches.map(item => ({
        bin: item.bin.id,
        expected: item.code,
        matched: Boolean(item.record),
        matched_id: item.record?.id || ''
      }))
    );

    console.log('BioBloom Supabase codes:', available);
    console.log('BioBloom website codes:', expected);

    let result =
      'เชื่อมต่อสำเร็จ พบ ' +
      count + '/3 รหัสบอร์ด | ' + details;

    if (count < 3) {
      result +=
        ' | Supabase: ' +
        (available.join(', ') || '(ไม่มีแถว)') +
        ' | เว็บ: ' +
        expected.join(', ');
    } else {
      result += ' | รหัสตรงกันครบแล้ว';
    }

    message(result);

  } catch (error) {
    console.error('BioBloom connection test:', error);

    message(
      'เชื่อมต่อไม่สำเร็จ: ' + error.message
    );
  }
}

function saveConfig() {
  try {
    state.config = configFromForm();
    save();

    message('บันทึกการตั้งค่าเรียบร้อยแล้ว');

    if (state.mode === 'live') {
      polling();
    }

  } catch (error) {
    message(error.message);
  }
}

// ============================================================
// Real sensor readings
// No ph column required.
// ============================================================

function normalized(row) {
  return {
    ph: null,
    temperature: num(row.temperature),
    humidity: num(row.humidity),
    compost_moisture_raw:
      row.compost_moisture_raw ?? null,
    fan_status: row.fan_status,
    pump_status: row.pump_status,
    recorded_at: row.recorded_at
  };
}

async function fetchBoard() {
  if (state.mode !== 'live' || busy) return;

  if (!state.config.url || !state.config.key) {
    liveError = 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ';
    render();
    return;
  }

  busy = true;

  const cfg = {
    url: state.config.url,
    key: state.config.key,
    codes: { ...state.config.codes }
  };

  try {
    const bins = await loadBins(cfg);
    const matches = matchSummary(bins, cfg.codes);

    const data = await Promise.all(
      matches.map(async item => {
        const bin = item.bin;
        const matched = item.record;

        if (!matched) {
          return [
            bin.id,
            {
              latest: null,
              rows: []
            }
          ];
        }

        const path =
          'sensor_readings?' +
          'select=temperature,humidity,' +
          'compost_moisture_raw,' +
          'fan_status,pump_status,recorded_at' +
          '&bin_id=eq.' +
          encodeURIComponent(matched.id) +
          '&order=recorded_at.desc' +
          '&limit=30';

        const readings = await get(cfg, path);

        if (!Array.isArray(readings)) {
          throw new Error(
            'ข้อมูล sensor_readings ไม่ถูกต้อง'
          );
        }

        const list = readings
          .slice()
          .reverse()
          .map(normalized);

        return [
          bin.id,
          {
            latest: list.at(-1) || null,
            rows: list
          }
        ];
      })
    );

    if (
      state.mode === 'live' &&
      state.config.url === cfg.url
    ) {
      live = Object.fromEntries(data);
      liveError = '';

      const found = matches.filter(
        item => item.record
      ).length;

      const active = data.filter(
        ([, result]) => result.latest !== null
      ).length;

      message(
        'พบรหัสบอร์ด ' + found +
        '/3 | มีข้อมูลเซนเซอร์ ' +
        active + '/3 ถัง | ล่าสุด ' +
        new Date().toLocaleTimeString('th-TH')
      );

      render();
    }

  } catch (error) {
    console.error('BioBloom live data:', error);

    liveError = 'อ่านข้อมูลบอร์ดไม่สำเร็จ';

    message(
      'อ่านข้อมูลไม่สำเร็จ: ' + error.message
    );

    render();

  } finally {
    busy = false;
  }
}

function polling() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  if (state.mode === 'live') {
    fetchBoard();

    timer = setInterval(
      fetchBoard,
      12000
    );
  }
}

// ============================================================
// CSV export
// ============================================================

function exportCSV() {
  const all = [];
  const filter = $('history-filter').value;

  for (const bin of BINS) {
    if (filter !== 'all' && filter !== bin.id) continue;

    for (const reading of rows(bin.id)) {
      all.push([
        reading.recorded_at,
        bin.name,
        state.mode === 'sim'
          ? reading.ph ?? ''
          : '',
        reading.temperature ?? '',
        reading.humidity ?? '',
        state.mode
      ]);
    }
  }

  if (!all.length) {
    alert('ยังไม่มีข้อมูลให้ส่งออก');
    return;
  }

  all.unshift([
    'timestamp',
    'bin',
    'pH',
    'temperature_C',
    'humidity_RH',
    'source'
  ]);

  const csv = '\ufeff' + all.map(row =>
    row.map(value =>
      '"' + String(value).replaceAll('"', '""') + '"'
    ).join(',')
  ).join('\r\n');

  const url = URL.createObjectURL(
    new Blob([csv], {
      type: 'text/csv;charset=utf-8'
    })
  );

  const a = document.createElement('a');
  a.href = url;
  a.download =
    'BioBloom_3_Bins_' + state.mode + '.csv';

  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1200);
}

// ============================================================
// Event listeners
// ============================================================

document.querySelectorAll('[data-page]').forEach(button => {
  button.onclick = () => go(button.dataset.page);
});

document.querySelectorAll('[data-mode]').forEach(button => {
  button.onclick = () => switchMode(button.dataset.mode);
});

['ph', 'temp', 'humidity'].forEach(key => {
  $('slider-' + key).oninput = simulate;
});

$('record').onclick = record;
$('reset').onclick = reset;

$('refresh').onclick = () => {
  if (state.mode === 'live') {
    fetchBoard();
  } else {
    render();
  }
};

$('open-connect').onclick = () => go('connect');

$('save-config').onclick = saveConfig;
$('test').onclick = test;

$('history-filter').onchange = renderHistory;
$('export').onclick = exportCSV;

// ============================================================
// Restore configuration into form
// ============================================================

$('url').value = state.config.url;
$('apikey').value = state.config.key;

for (const bin of BINS) {
  $('code-' + bin.id).value =
    state.config.codes[bin.id];
}

// ============================================================
// Clock
// ============================================================

function updateClock() {
  $('clock').textContent =
    new Date().toLocaleString('th-TH', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
}

updateClock();
setInterval(updateClock, 30000);

// ============================================================
// Start BioBloom
// ============================================================

render();
polling();
