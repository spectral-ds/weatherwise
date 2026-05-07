// ═══════════════════════════════════════════
//  WeatherWise — script.js
// ═══════════════════════════════════════════

const API_KEY    = "44bcc330a2acba6eef51dc132871909b";
const EJS_SVC    = "service_cwpf3bo";   // from emailjs.com → Email Services
const EJS_TPL    = "template_06k5ife";  // from emailjs.com → Email Templates

let currentUser     = null;
let currentUserName = null;
let chart           = null;
let chartType       = 'line';
let chartData       = null;


// ── THEME ─────────────────────────────────
function toggleTheme() {
  const r    = document.documentElement;
  const dark = r.getAttribute('data-theme') === 'dark';
  r.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.querySelector('.theme-icon').textContent = dark ? '🌙' : '☀️';
  localStorage.setItem('ww-theme', dark ? 'light' : 'dark');
}
function initTheme() {
  const t = localStorage.getItem('ww-theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.querySelector('.theme-icon').textContent = t === 'dark' ? '☀️' : '🌙';
}


// ── TOAST ─────────────────────────────────
function toast(msg, type = 'info', ms = 3500) {
  const el   = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast toast-${type}`;
  el.classList.remove('hidden');
  clearTimeout(window._toast);
  window._toast = setTimeout(() => el.classList.add('hidden'), ms);
}


// ── FORMS ─────────────────────────────────
function showForm(id) {
  document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function togglePwd(id, btn) {
  const el  = document.getElementById(id);
  el.type   = el.type === 'password' ? 'text' : 'password';
  btn.textContent = el.type === 'password' ? '👁' : '🙈';
}


// ── NAVIGATION ────────────────────────────
function enterWeatherPage() {
  document.getElementById('authPage').classList.add('hidden');
  document.getElementById('weatherPage').classList.remove('hidden');
  updateUserBadge();
  // Alert panel only for logged-in users
  document.getElementById('alertPanel').classList.toggle('hidden', !currentUser);
}
function enterGuest() { enterWeatherPage(); }

function goBack() {
  currentUser = currentUserName = null;
  document.getElementById('authPage').classList.remove('hidden');
  document.getElementById('weatherPage').classList.add('hidden');
  document.getElementById('historyList').innerHTML = '';
  document.getElementById('historyEmpty').classList.remove('hidden');
  document.getElementById('weatherContent').classList.add('hidden');
  document.getElementById('emptyState').classList.remove('hidden');
  document.getElementById('alertPanel').classList.add('hidden');
  showForm('loginForm');
}

function updateUserBadge() {
  const badge  = document.getElementById('userBadge');
  const label  = document.getElementById('userLabel');
  const avatar = document.getElementById('userAvatar');
  if (currentUser) {
    label.textContent  = currentUserName || currentUser.split('@')[0];
    avatar.textContent = (currentUserName || currentUser)[0].toUpperCase();
  } else {
    label.textContent  = 'Guest';
    avatar.textContent = '👤';
  }
  badge.classList.remove('hidden');
}


// ── LOGIN ─────────────────────────────────
async function loginUser() {
  const email = document.getElementById('loginEmail').value.trim();
  const pw    = document.getElementById('loginPassword').value;
  if (!email || !pw) { toast('Please enter email and password', 'error'); return; }
  try {
    const res  = await fetch('/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email, password:pw})
    });
    const data = await res.json();
    if (data.status === 'success') {
      currentUser     = data.email || email;
      currentUserName = data.name  || email.split('@')[0];
      toast(`Welcome back, ${currentUserName}! ☀️`, 'success');
      enterWeatherPage();
      loadHistory();
      prefillAlerts(data);
    } else {
      toast(data.message || 'Invalid credentials', 'error');
    }
  } catch { toast('Connection error. Is the server running?', 'error'); }
}


// ── REGISTER ──────────────────────────────
async function registerUser() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pw    = document.getElementById('regPassword').value;
  if (!name || !email || !pw)             { toast('Please fill in all fields', 'error'); return; }
  if (pw.length < 6)                       { toast('Password must be at least 6 characters', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Invalid email address', 'error'); return; }
  try {
    const res  = await fetch('/register', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({name, email, password:pw})
    });
    const data = await res.json();
    if (data.status === 'success') {
      toast('Account created! Please sign in ✅', 'success');
      showForm('loginForm');
    } else {
      toast(data.message || 'Registration failed', 'error');
    }
  } catch { toast('Connection error', 'error'); }
}


// ── FORGOT — Step 1: check email exists ───
async function forgotLookup() {
  const email = document.getElementById('forgotEmail').value.trim();
  if (!email) { toast('Enter your email address', 'error'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Invalid email address', 'error'); return; }

  try {
    const res  = await fetch('/check_email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if (data.exists) {
      // Email found — go to step 2
      document.getElementById('resetEmailLabel').textContent = email;
      document.getElementById('resetNewPw').value = '';
      document.getElementById('resetConfirmPw').value = '';
      showForm('resetForm');
    } else {
      toast('No account found with that email', 'error');
    }
  } catch { toast('Connection error. Try again.', 'error'); }
}

// ── FORGOT — Step 2: save new password ────
async function doResetPassword() {
  const email   = document.getElementById('forgotEmail').value.trim();
  const pw      = document.getElementById('resetNewPw').value;
  const confirm = document.getElementById('resetConfirmPw').value;

  if (!pw)         { toast('Enter a new password', 'error'); return; }
  if (pw.length < 6) { toast('Password must be at least 6 characters', 'error'); return; }
  if (pw !== confirm) { toast('Passwords do not match', 'error'); return; }

  try {
    const res  = await fetch('/reset_password_direct', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: pw })
    });
    const data = await res.json();
    if (data.status === 'success') {
      toast('Password updated! Please sign in ✅', 'success');
      showForm('loginForm');
    } else {
      toast(data.message || 'Failed to reset password', 'error');
    }
  } catch { toast('Connection error. Try again.', 'error'); }
}


// ── HISTORY ───────────────────────────────
async function loadHistory() {
  if (!currentUser) return;
  try {
    const res  = await fetch('/get_history', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email: currentUser})
    });
    const data  = await res.json();
    const list  = document.getElementById('historyList');
    const empty = document.getElementById('historyEmpty');
    list.innerHTML = '';
    if (!data.length) { empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    data.forEach(item => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="hist-city" onclick="searchFromHistory('${item[1]}')">${item[1]}</span>
        <button class="hist-del" onclick="deleteHistory(${item[0]})" title="Remove">✕</button>`;
      list.appendChild(li);
    });
  } catch(e) { console.error('History error:', e); }
}

async function deleteHistory(id) {
  await fetch('/delete_history', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({id})
  });
  loadHistory();
}

function searchFromHistory(city) {
  document.getElementById('cityInput').value = city;
  getWeather();
}


// ── ALERT PANEL ───────────────────────────
function prefillAlerts(data) {
  const t = document.getElementById('alertToggle');
  const c = document.getElementById('alertCity');
  const h = document.getElementById('alertTime');
  const f = document.getElementById('alertFreq');
  if (t) t.checked = !!data.alert_enabled;
  if (c) c.value   = data.alert_city  || '';
  if (h) h.value   = data.alert_time  || '07:00';
  if (f) f.value   = data.alert_freq  || 'daily';
  updateAlertPanel();
}

function updateAlertPanel() {
  const t = document.getElementById('alertToggle');
  const o = document.getElementById('alertOptions');
  if (t && o) o.classList.toggle('alert-options-hidden', !t.checked);
}

async function saveAlertSettings() {
  if (!currentUser) { toast('Sign in to save alert settings', 'error'); return; }
  const enabled = document.getElementById('alertToggle').checked;
  const city    = (document.getElementById('alertCity').value || '').trim();
  const time    = document.getElementById('alertTime').value   || '07:00';
  const freq    = document.getElementById('alertFreq').value   || 'daily';
  if (enabled && !city) { toast('Please enter a city for alerts', 'error'); return; }
  try {
    const res  = await fetch('/update_alert', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email:currentUser, enabled, city, time, freq})
    });
    const data = await res.json();
    toast(data.status === 'saved'
      ? (enabled ? `✅ Alerts saved for ${city} at ${time}` : '🔕 Alerts disabled')
      : 'Failed to save', data.status === 'saved' ? 'success' : 'error');
  } catch { toast('Connection error', 'error'); }
}


// ── EMAILJS TEST ALERT ────────────────────
async function sendTestAlert() {
  if (!currentUser) { toast('Sign in to test alerts', 'error'); return; }
  const city = (document.getElementById('alertCity').value || '').trim();
  if (!city) { toast('Enter a city first', 'error'); return; }

  if (EJS_SVC === 'YOUR_SERVICE_ID') {
    toast('⚠️ Configure EmailJS first — replace YOUR_SERVICE_ID and YOUR_TEMPLATE_ID in script.js', 'error', 7000);
    return;
  }

  const btn = document.getElementById('testAlertBtn');
  btn.textContent = '⏳ Fetching weather…';
  btn.disabled    = true;

  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`
    );
    const w = await res.json();
    if (w.cod !== 200) { toast('City not found', 'error'); return; }

    btn.textContent = '📧 Sending…';

    await emailjs.send(EJS_SVC, EJS_TPL, {
      to_email:    currentUser,
      to_name:     currentUserName || 'User',
      city:        `${w.name}, ${w.sys.country}`,
      temperature: `${Math.round(w.main.temp)}°C`,
      feels_like:  `${Math.round(w.main.feels_like)}°C`,
      description: w.weather[0].description.charAt(0).toUpperCase() + w.weather[0].description.slice(1),
      humidity:    `${w.main.humidity}%`,
      wind_speed:  `${w.wind && w.wind.speed ? Math.round(w.wind.speed * 3.6) : 0} km/h`,
      date:        new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})
    });

    toast(`📧 Alert sent to ${currentUser}!`, 'success', 5000);
  } catch(err) {
    console.error('EmailJS error:', err);
    toast('Failed to send. Check EmailJS config.', 'error', 6000);
  } finally {
    btn.textContent = '📧 Send Test Email';
    btn.disabled    = false;
  }
}


// ── WEATHER EMOJI ─────────────────────────
function emoji(code) {
  if (code >= 200 && code < 300) return '⛈️';
  if (code >= 300 && code < 400) return '🌧️';
  if (code >= 500 && code < 600) return code === 500 ? '🌦️' : '🌧️';
  if (code >= 600 && code < 700) return '❄️';
  if (code >= 700 && code < 800) return '🌫️';
  if (code === 800) return '☀️';
  if (code === 801) return '🌤️';
  if (code === 802) return '⛅';
  return '☁️';
}


// ── DATE HELPERS ──────────────────────────
const fmtDate = (dt, tz=0) =>
  new Date((dt+tz)*1000).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'});
const fmtDay = (dt, tz=0) => {
  const d = new Date((dt+tz)*1000);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  return d.toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'});
};
const fmtShort = (dt, tz=0) =>
  new Date((dt+tz)*1000).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const fmtHour = (dt, tz=0) =>
  new Date((dt+tz)*1000).toLocaleTimeString('en-US',{hour:'numeric',hour12:true,timeZone:'UTC'});


// ── GET WEATHER ───────────────────────────
async function getWeather() {
  const city = document.getElementById('cityInput').value.trim();
  if (!city) { toast('Enter a city name', 'error'); return; }

  document.getElementById('searchError').classList.add('hidden');
  document.getElementById('loadingState').classList.remove('hidden');
  document.getElementById('weatherContent').classList.add('hidden');

  try {
    const [cr, fr] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&appid=${API_KEY}&units=metric`)
    ]);
    const curr = await cr.json();
    const fore = await fr.json();

    if (curr.cod !== 200 || fore.cod !== '200') {
      document.getElementById('loadingState').classList.add('hidden');
      document.getElementById('searchError').classList.remove('hidden');
      toast('City not found. Check the spelling.', 'error');
      return;
    }

    renderCurrent(curr);
    renderForecast(fore, curr.timezone);
    renderHourly(fore, curr.timezone);
    buildChart(fore, curr.timezone);

    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('weatherContent').classList.remove('hidden');

    // Auto-fill alert city
    const ac = document.getElementById('alertCity');
    if (ac && !ac.value) ac.value = curr.name;

    if (currentUser) {
      fetch('/save_history', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({email:currentUser, city:curr.name})
      }).then(() => loadHistory()).catch(()=>{});
    }

  } catch {
    document.getElementById('loadingState').classList.add('hidden');
    toast('Failed to fetch weather. Check your connection.', 'error');
  }
}


// ── RENDER CURRENT ────────────────────────
function renderCurrent(d) {
  document.getElementById('cityName').textContent    = `${d.name}, ${d.sys.country}`;
  document.getElementById('weatherDate').textContent = fmtDate(d.dt, d.timezone);
  document.getElementById('currentTemp').textContent = `${Math.round(d.main.temp)}°`;
  document.getElementById('weatherDesc').textContent = d.weather[0].description;
  document.getElementById('tempHigh').textContent    = `↑ ${Math.round(d.main.temp_max)}°`;
  document.getElementById('tempLow').textContent     = `↓ ${Math.round(d.main.temp_min)}°`;
  document.getElementById('humidity').textContent    = `${d.main.humidity}%`;
  document.getElementById('windSpeed').textContent   = `${Math.round(d.wind.speed*3.6)} km/h`;
  document.getElementById('visibility').textContent  = d.visibility ? `${(d.visibility/1000).toFixed(1)} km` : 'N/A';
  document.getElementById('feelsLike').textContent   = `${Math.round(d.main.feels_like)}°`;
  document.getElementById('weatherEmoji').textContent = emoji(d.weather[0].id);
}


// ── RENDER FORECAST ───────────────────────
function renderForecast(data, tz) {
  const wrap = document.getElementById('forecastCards');
  wrap.innerHTML = '';
  const days  = {};
  data.list.forEach(item => {
    const key  = new Date((item.dt+tz)*1000).toISOString().split('T')[0];
    const hour = new Date((item.dt+tz)*1000).getUTCHours();
    if (!days[key] || Math.abs(hour-12) < Math.abs(new Date((days[key].dt+tz)*1000).getUTCHours()-12))
      days[key] = item;
  });
  const today = new Date().toDateString();
  Object.keys(days).slice(0,7).forEach(key => {
    const item    = days[key];
    const isToday = new Date((item.dt+tz)*1000).toDateString() === today;
    const c       = document.createElement('div');
    c.className   = `fc-card${isToday?' today':''}`;
    c.innerHTML   = `
      <div class="fc-day">${fmtDay(item.dt,tz)}</div>
      <div class="fc-date">${fmtShort(item.dt,tz)}</div>
      <div class="fc-emoji">${emoji(item.weather[0].id)}</div>
      <div class="fc-temp">${Math.round(item.main.temp)}°</div>
      <div class="fc-desc">${item.weather[0].description}</div>`;
    wrap.appendChild(c);
  });
}


// ── RENDER HOURLY ─────────────────────────
function renderHourly(data, tz) {
  const wrap = document.getElementById('hourlyScroll');
  wrap.innerHTML = '';
  data.list.slice(0,8).forEach(item => {
    const d = document.createElement('div');
    d.className = 'hc';
    d.innerHTML = `
      <div class="hc-time">${fmtHour(item.dt,tz)}</div>
      <div class="hc-emoji">${emoji(item.weather[0].id)}</div>
      <div class="hc-temp">${Math.round(item.main.temp)}°</div>`;
    wrap.appendChild(d);
  });
}


// ── CHART ─────────────────────────────────
function buildChart(data, tz) {
  const days = {};
  data.list.forEach(item => {
    const key  = new Date((item.dt+tz)*1000).toISOString().split('T')[0];
    const hour = new Date((item.dt+tz)*1000).getUTCHours();
    if (!days[key] || Math.abs(hour-12) < Math.abs(new Date((days[key].dt+tz)*1000).getUTCHours()-12))
      days[key] = item;
  });
  const entries = Object.values(days).slice(0,7);
  chartData = {
    labels: entries.map(e => fmtDay(e.dt,tz)),
    temps:  entries.map(e => Math.round(e.main.temp))
  };
  drawChart(chartData.labels, chartData.temps, chartType);
}

function switchChart(type, btn) {
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  chartType = type;
  if (chartData) drawChart(chartData.labels, chartData.temps, type);
}

function drawChart(labels, temps, type='line') {
  const dark    = document.documentElement.getAttribute('data-theme') === 'dark';
  const tc      = dark ? '#7e93b8' : '#475569';
  const gc      = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const ac      = dark ? '#5b8fff' : '#3b7bff';
  const af      = dark ? 'rgba(91,143,255,0.14)' : 'rgba(59,123,255,0.1)';
  const ctx     = document.getElementById('forecastChart');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type,
    data: { labels, datasets:[{
      label:'Temperature °C', data:temps,
      borderColor:ac, backgroundColor:type==='line'?af:ac,
      borderWidth:2.5, tension:0.4, fill:type==='line',
      pointBackgroundColor:ac, pointBorderColor:dark?'#172036':'#fff',
      pointBorderWidth:2, pointRadius:5, pointHoverRadius:7,
      borderRadius:type==='bar'?8:0
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{
          backgroundColor:dark?'#1e2a42':'#fff',
          titleColor:dark?'#e8edf8':'#0f172a',
          bodyColor:dark?'#7e93b8':'#475569',
          borderColor:dark?'#2a3d60':'#e2e8f0',
          borderWidth:1, padding:12, cornerRadius:10,
          callbacks:{label:c=>` ${c.parsed.y}°C`}
        }
      },
      scales:{
        x:{ticks:{color:tc,font:{family:'Inter',size:12}},grid:{color:gc},border:{display:false}},
        y:{ticks:{color:tc,font:{family:'Inter',size:12},callback:v=>`${v}°`},grid:{color:gc},border:{display:false}}
      }
    }
  });
}

// Re-render chart on theme toggle
new MutationObserver(() => {
  if (chartData) drawChart(chartData.labels, chartData.temps, chartType);
}).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});


// ── INIT ──────────────────────────────────
initTheme();
