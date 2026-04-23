function updateText(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value ?? "-";
}

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat('pt-BR').format(value);
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

    document.getElementById('last_errors').textContent = data.errors.last_errors.length
      ? data.errors.last_errors.join('\n')
      : 'Sem erros na janela atual.';

    document.getElementById('source-info').textContent =
      `Status URL: ${data.sources.status_url} | Access log: ${data.sources.access_log} | Error log: ${data.sources.error_log}`;
  } catch (error) {
    document.getElementById('source-info').textContent = `Falha ao coletar métricas: ${error}`;
  }
}

refreshMetrics();
setInterval(refreshMetrics, 2000);
