let historyChart;
let statusChart;


function updateClock() {
  const clockEl = document.getElementById('panel_clock');
  if (!clockEl) return;
  const now = new Date();
  clockEl.textContent = now.toLocaleString('pt-BR');
}

function updateText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? "-";
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat('pt-BR').format(value);
}

function formatTime(ts) {
  if (!ts) return '--:--:--';
  return new Date(ts * 1000).toLocaleTimeString('pt-BR');
}

function chartDefaults() {
  return {
    plugins: {
      legend: { labels: { color: '#e2e8f0' } },
    },
    scales: {
      x: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.08)' } },
      y: { ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255,255,255,0.08)' } },
    },
  };
}

function renderStatusCodes(statusCodes = {}) {
  const container = document.getElementById('status_codes');
  if (!container) return;

  container.innerHTML = '';
  const entries = Object.entries(statusCodes);

  if (!entries.length) {
    container.innerHTML = '<span class="text-light-emphasis">Sem dados de status na janela atual.</span>';
    return;
  }

  entries
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([code, count]) => {
      const family = `${String(code)[0]}xx`;
      const badge = document.createElement('span');
      badge.className = `status-badge status-${family}`;
      badge.textContent = `${code}: ${formatNumber(count)}`;
      container.appendChild(badge);
    });
}

function renderHistoryChart(history = []) {
  const canvas = document.getElementById('historyChart');
  if (!canvas) return;

  const labels = history.map((p) => formatTime(p.ts));
  const requests = history.map((p) => p.requests_window ?? 0);
  const errors = history.map((p) => p.error_rate_pct ?? 0);

  if (!historyChart) {
    historyChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Requests',
            data: requests,
            borderColor: '#ffcc29',
            backgroundColor: 'rgba(255, 204, 41, 0.15)',
            tension: 0.35,
            fill: true,
          },
          {
            label: 'Taxa de erro %',
            data: errors,
            borderColor: '#ff5a5f',
            backgroundColor: 'rgba(255, 90, 95, 0.12)',
            tension: 0.35,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        ...chartDefaults(),
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
          ...chartDefaults().scales,
          y: { ...chartDefaults().scales.y, beginAtZero: true },
          y1: {
            position: 'right',
            beginAtZero: true,
            ticks: { color: '#fecaca' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    });
    return;
  }

  historyChart.data.labels = labels;
  historyChart.data.datasets[0].data = requests;
  historyChart.data.datasets[1].data = errors;
  historyChart.update();
}

function renderStatusChart(statusCodes = {}) {
  const canvas = document.getElementById('statusChart');
  if (!canvas) return;

  const labels = Object.keys(statusCodes);
  const values = Object.values(statusCodes);
  const colors = labels.map((code) => {
    if (String(code).startsWith('2')) return 'rgba(34, 197, 94, 0.75)';
    if (String(code).startsWith('3')) return 'rgba(59, 130, 246, 0.75)';
    return 'rgba(239, 68, 68, 0.78)';
  });

  if (!statusChart) {
    statusChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Quantidade por status',
            data: values,
            backgroundColor: colors,
            borderRadius: 6,
          },
        ],
      },
      options: {
        ...chartDefaults(),
        plugins: {
          ...chartDefaults().plugins,
          legend: { display: false },
        },
      },
    });
    return;
  }

  statusChart.data.labels = labels;
  statusChart.data.datasets[0].data = values;
  statusChart.data.datasets[0].backgroundColor = colors;
  statusChart.update();
}

async function refreshMetrics() {
  try {
    const response = await fetch('/api/metrics');
    const data = await response.json();

    updateText('panel_version', data.version);
    updateText('active_connections', formatNumber(data.status.active_connections));
    updateText('reading', formatNumber(data.status.reading));
    updateText('writing', formatNumber(data.status.writing));
    updateText('waiting', formatNumber(data.status.waiting));
    updateText('requests_window', formatNumber(data.access.requests_window));
    updateText('error_rate_pct', `${data.access.error_rate_pct ?? '-'}%`);
    updateText('bytes_sent_window', formatNumber(data.access.bytes_sent_window));

    renderStatusCodes(data.access.status_codes);
    renderHistoryChart(data.history || []);
    renderStatusChart(data.access.status_codes || {});

    document.getElementById('last_errors').textContent = data.errors.last_errors.length
      ? data.errors.last_errors.join('\n')
      : 'Sem erros na janela atual.';

    document.getElementById('source-info').textContent =
      `Status URL: ${data.sources.status_url} | Access log: ${data.sources.access_log} | Error log: ${data.sources.error_log}`;
  } catch (error) {
    document.getElementById('source-info').textContent = `Falha ao coletar métricas: ${error}`;
  }
}

updateClock();
refreshMetrics();
setInterval(updateClock, 1000);
setInterval(refreshMetrics, 2000);
