const endpoint = '/api/calendar';

async function query(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.user) {
    throw Error(data?.message || 'Sessione Cloudflare scaduta o calendario non disponibile. Ricarica la pagina.');
  }
  return data;
}

export function connectCloudflare({ onData, onError }) {
  let revision = -1;
  let loading = false;
  const apply = data => {
    if (!data || data.revision <= revision) return;
    revision = data.revision;
    onData(data);
  };
  async function refresh() {
    if (loading || document.hidden) return;
    loading = true;
    try { apply(await query(endpoint + '?revision=' + revision)); }
    catch (error) { onError(error); }
    finally { loading = false; }
  }
  window.addEventListener('focus', refresh);
  document.addEventListener('visibilitychange', refresh);
  window.setInterval(refresh, 5000);
  void refresh();

  return {
    async save(state, expectedRevision, action, details) {
      const { audit, ...calendar } = state;
      try {
        apply(await query(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: calendar, revision: expectedRevision, action, details })
        }));
      } catch (error) {
        void refresh();
        throw error;
      }
    }
  };
}
