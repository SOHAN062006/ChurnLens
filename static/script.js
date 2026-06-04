/* ChurnLens — script.js
   Wired to Flask API endpoints: /api/metrics, /api/charts, /api/customers,
   /api/predict, /api/model-info
*/

// ── Chart instances (kept for destroy-before-redraw) ─────────────────────────
let monthlyChart, riskChart, cityChart, contractChart, planChart, featureChart;
let gaugeChartInst = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadMetrics();
  loadCharts();
});

// ── View switcher ─────────────────────────────────────────────────────────────
function switchView(name, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  if (btn) btn.classList.add('active');

  if (name === 'customers') loadCustomers();
  if (name === 'model')     loadModelInfo();
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD — metrics + charts
// ══════════════════════════════════════════════════════════════════════════════

function loadMetrics() {
  fetch('/api/metrics')
    .then(r => r.json())
    .then(d => {
      animateCount('kpi-total',  d.total_customers);
      animateCount('kpi-active', d.active_customers);
      animateCount('kpi-churn',  d.potential_churn);
      document.getElementById('kpi-rate').textContent = d.churn_rate + '%';
      document.getElementById('dash-timestamp').textContent =
        `${d.total_customers.toLocaleString()} total customers · Churn rate ${d.churn_rate}%`;

      // Update churn trend text
      const trendEl = document.getElementById('churn-trend');
      if (trendEl) trendEl.textContent = `${d.churn_rate}% overall churn rate`;

      // Show insights strip
      const ins = document.getElementById('insightsStrip');
      if (ins) ins.style.display = 'grid';
    })
    .catch(err => {
      console.error('Metrics error:', err);
      ['kpi-total','kpi-active','kpi-churn','kpi-rate'].forEach(id => {
        document.getElementById(id).textContent = 'Error';
      });
    });
}

function animateCount(id, end, duration = 1000) {
  const el  = document.getElementById(id);
  if (!el) return;
  const step = end / 60;
  let cur = 0;
  const timer = setInterval(() => {
    cur = Math.min(cur + step, end);
    el.textContent = Math.round(cur).toLocaleString();
    if (cur >= end) clearInterval(timer);
  }, duration / 60);
}

function loadCharts() {
  fetch('/api/charts')
    .then(r => r.json())
    .then(d => {
      buildTenureChart(d.tenure_trend);
      buildRiskChart(d.risk_distribution);
      buildCityChart(d.city_churn);
      buildContractChart(d.contract_churn);
      buildPlanChart(d.plan_churn);
    })
    .catch(err => console.error('Charts error:', err));
}

function buildTenureChart(data) {
  const ctx = document.getElementById('monthlyChart');
  if (!ctx) return;
  if (monthlyChart) monthlyChart.destroy();
  monthlyChart = new Chart(ctx, {
    data: {
      labels: data.labels,
      datasets: [
        {
          type: 'bar',
          label: 'Churned',
          data: data.churned,
          backgroundColor: 'rgba(216,90,48,0.85)',
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Churn Rate %',
          data: data.churn_rate,
          borderColor: '#ef9f27',
          backgroundColor: 'rgba(239,159,39,0.1)',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: '#ef9f27',
          fill: true,
          tension: 0.4,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888' } },
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 11 }, color: '#888' },
          title: { display: false }
        },
        y1: {
          type: 'linear',
          position: 'right',
          beginAtZero: true,
          max: 100,
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#888', callback: v => v + '%' }
        }
      },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

function buildRiskChart(data) {
  const ctx = document.getElementById('riskChart');
  if (!ctx) return;
  if (riskChart) riskChart.destroy();
  riskChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Churned', 'Medium Risk', 'Retained'],
      datasets: [{
        data: [data.high, data.medium, data.low],
        backgroundColor: ['#d85a30', '#ef9f27', '#1d9e75'],
        borderWidth: 0,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.raw.toLocaleString() } }
      }
    }
  });
}

function buildCityChart(data) {
  const ctx = document.getElementById('cityChart');
  if (!ctx) return;
  if (cityChart) cityChart.destroy();
  const colors = ['#d85a30','#e06a3d','#e87a4b','#ef8f62','#f4a57e','#f8bb9a'];
  cityChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        data: data.churned,
        backgroundColor: colors.slice(0, data.labels.length),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#888' } },
        y: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#888' } }
      },
      animation: { duration: 900 }
    }
  });
}

function buildContractChart(data) {
  const ctx = document.getElementById('contractChart');
  if (!ctx) return;
  if (contractChart) contractChart.destroy();
  contractChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Churn Rate %',
        data: data.churn_rate,
        backgroundColor: ['#d85a30', '#ef9f27', '#1d9e75'],
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#888', maxRotation: 20 } },
        y: {
          max: 80,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 10 }, color: '#888', callback: v => v + '%' }
        }
      },
      animation: { duration: 900 }
    }
  });
}

function buildPlanChart(data) {
  const ctx = document.getElementById('planChart');
  if (!ctx) return;
  if (planChart) planChart.destroy();
  planChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Churn Rate %',
        data: data.churn_rate,
        backgroundColor: ['#3498db', '#ef9f27', '#1d9e75'],
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } }
      },
      scales: {
        x: {
          beginAtZero: true,
          max: 80,
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#888', callback: v => v + '%' }
        },
        y: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#888' } }
      },
      animation: { duration: 900 }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMERS TABLE
// ══════════════════════════════════════════════════════════════════════════════
let allCustomers = [];

function loadCustomers() {
  fetch('/api/customers')
    .then(r => r.json())
    .then(d => {
      allCustomers = d.customers || [];
      renderTable(allCustomers);
    })
    .catch(err => {
      console.error('Customers error:', err);
      document.getElementById('tableBody').innerHTML =
        '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#d85a30">Failed to load customer data.</td></tr>';
    });
}

function renderTable(data) {
  const body = document.getElementById('tableBody');
  if (!data || data.length === 0) {
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:2rem;color:#888">No customers found.</td></tr>';
    return;
  }
  body.innerHTML = data.map(c => {
    const pct    = Math.round(c.risk * 100);
    const cls    = c.level === 'high' ? 'badge-high' : c.level === 'medium' ? 'badge-med' : 'badge-low';
    const lbl    = c.level === 'high' ? 'High' : c.level === 'medium' ? 'Medium' : 'Low';
    const barCls = c.level === 'high' ? 'risk-high' : c.level === 'medium' ? 'risk-med' : 'risk-low';
    return `<tr data-level="${c.level}">
      <td><strong>${c.id}</strong></td>
      <td>${c.city}</td>
      <td>${c.plan}</td>
      <td style="font-size:0.78rem">${c.contract}</td>
      <td>${c.tenure}mo</td>
      <td>₹${Math.round(c.charge).toLocaleString()}</td>
      <td>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="risk-bar"><div class="risk-fill ${barCls}" style="width:${pct}%"></div></div>
          <span style="font-size:0.77rem;font-weight:600;color:var(--ink2)">${pct}%</span>
        </div>
      </td>
      <td><span class="badge ${cls}">${lbl}</span></td>
      <td><button class="act-btn" onclick="prefillAndPredict(${JSON.stringify(c).replace(/"/g,'&quot;')})">Predict →</button></td>
    </tr>`;
  }).join('');
}

function filterTable() {
  const val = document.getElementById('riskFilter').value;
  document.querySelectorAll('#tableBody tr[data-level]').forEach(tr => {
    tr.style.display = (val === 'all' || tr.dataset.level === val) ? '' : 'none';
  });
}

function prefillAndPredict(c) {
  // Switch to predict tab and prefill sliders with this customer's values
  switchView('predict', document.querySelectorAll('.nav-btn')[1]);
  document.getElementById('p-city').value     = c.city;
  document.getElementById('p-plan').value     = c.plan;
  document.getElementById('p-contract').value = c.contract;
  const tenureEl  = document.getElementById('p-tenure');
  const chargeEl  = document.getElementById('p-charge');
  tenureEl.value  = c.tenure;
  chargeEl.value  = Math.round(c.charge);
  document.getElementById('tenure-val').textContent = c.tenure;
  document.getElementById('charge-val').textContent = '₹' + Math.round(c.charge);
  // Auto-run
  setTimeout(runPrediction, 300);
}

// ══════════════════════════════════════════════════════════════════════════════
// PREDICTION
// ══════════════════════════════════════════════════════════════════════════════

function runPrediction() {
  const overlay = document.getElementById('loadingOverlay');
  const msgs = [
    'Encoding categorical features…',
    'Running Random Forest model…',
    'Computing churn probability…',
    'Generating recommendations…'
  ];
  let i = 0;
  overlay.classList.add('show');
  document.getElementById('loadingText').textContent = msgs[0];
  const ticker = setInterval(() => {
    i++;
    if (i < msgs.length) document.getElementById('loadingText').textContent = msgs[i];
  }, 500);

  const payload = {
    tenure:           parseInt(document.getElementById('p-tenure').value),
    monthly_charge:   parseInt(document.getElementById('p-charge').value),
    support_calls:    parseInt(document.getElementById('p-support').value),
    contract:         document.getElementById('p-contract').value,
    internet_service: document.getElementById('p-internet').value,
    online_security:  document.getElementById('p-security').value,
    streaming_tv:     document.getElementById('p-tv').value,
    streaming_movies: document.getElementById('p-movies').value,
    city:             document.getElementById('p-city').value,
    plan_type:        document.getElementById('p-plan').value,
  };

  fetch('/api/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(r => r.json())
    .then(data => {
      clearInterval(ticker);
      overlay.classList.remove('show');
      if (data.error) { alert('Prediction error: ' + data.error); return; }
      displayResult(data);
    })
    .catch(err => {
      clearInterval(ticker);
      overlay.classList.remove('show');
      alert('Network error: ' + err.message);
    });
}

function displayResult(data) {
  document.getElementById('resultEmpty').style.display   = 'none';
  document.getElementById('resultContent').style.display = 'block';
  document.getElementById('resultCard').classList.add('has-result');

  const pct   = parseFloat(data.churn_probability);
  const level = data.risk_level;

  // Badge
  const badge = document.getElementById('riskBadge');
  badge.textContent = level === 'high' ? 'High Risk' : level === 'medium' ? 'Medium Risk' : 'Low Risk';
  badge.className   = 'result-status-badge ' +
    (level === 'high' ? 'status-high' : level === 'medium' ? 'status-med' : 'status-low');

  // Gauge
  document.getElementById('gaugePct').textContent = pct.toFixed(1) + '%';
  drawGauge(pct, level);

  // Factors
  const factors = data.factors || [];
  const fList   = document.getElementById('factorList');
  if (factors.length === 0) {
    fList.innerHTML = '<p style="font-size:0.78rem;color:var(--ink3)">No significant risk factors identified.</p>';
  } else {
    fList.innerHTML = factors.map(f => {
      const w   = Math.round(f.weight * 100);
      const cls = f.weight >= 0.7 ? 'factor-high' : f.weight >= 0.45 ? 'factor-med' : 'factor-low';
      return `<div class="factor-row">
        <span style="min-width:155px;font-size:0.77rem">${f.name}</span>
        <div class="factor-bar"><div class="factor-fill ${cls}" style="width:${w}%"></div></div>
        <span style="font-size:0.73rem;color:var(--ink3);min-width:30px;text-align:right">${w}%</span>
      </div>`;
    }).join('');
  }

  // Recommendations
  const recs = data.recommendations || [];
  document.getElementById('recBox').innerHTML =
    `<div class="rec-title">Recommended Actions</div>
     <ul class="rec-list">${recs.map(r => `<li>${r}</li>`).join('')}</ul>`;
}

function drawGauge(pct, level) {
  if (gaugeChartInst) gaugeChartInst.destroy();
  const color = level === 'high' ? '#d85a30' : level === 'medium' ? '#ef9f27' : '#1d9e75';
  gaugeChartInst = new Chart(document.getElementById('gaugeCanvas'), {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [pct, 100 - pct, 100],
        backgroundColor: [color, 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0)'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: false,
      rotation: -90,
      circumference: 180,
      cutout: '78%',
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      animation: { duration: 700, easing: 'easeOutQuart' }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// MODEL INFO
// ══════════════════════════════════════════════════════════════════════════════

function loadModelInfo() {
  fetch('/api/model-info')
    .then(r => r.json())
    .then(d => {
      const features = (d.features || []).slice(0, 10);
      if (features.length === 0) return;
      buildFeatureChart(features);
    })
    .catch(err => console.error('Model info error:', err));
}

function buildFeatureChart(features) {
  const ctx = document.getElementById('featureChart');
  if (!ctx) return;
  if (featureChart) featureChart.destroy();

  const labels = features.map(f => f.feature);
  const values = features.map(f => parseFloat((f.importance * 100).toFixed(1)));
  const colors = [
    '#d85a30','#e06a3d','#e87a4b','#ef8f62','#f4a57e',
    '#f8bb9a','#1d9e75','#2ab88a','#3ac99b','#4ad4a8'
  ];

  featureChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Importance %',
        data: values,
        backgroundColor: colors.slice(0, labels.length),
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ctx.raw.toFixed(1) + '%' } }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { font: { size: 11 }, color: '#888', callback: v => v + '%' }
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11 }, color: '#888' }
        }
      },
      animation: { duration: 900, easing: 'easeOutQuart' }
    }
  });
}
