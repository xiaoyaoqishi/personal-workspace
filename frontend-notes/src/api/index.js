import axios from 'axios';

const api = axios.create({ baseURL: '/api' });
const DEFAULT_SCOPE = 'notes';

function currentModuleScope() {
  try {
    const params = new URLSearchParams(window.location.search);
    const scope = (params.get('scope') || params.get('module_scope') || DEFAULT_SCOPE).trim().toLowerCase();
    return scope || DEFAULT_SCOPE;
  } catch {
    return DEFAULT_SCOPE;
  }
}

function withScopeParams(params) {
  return {
    ...(params || {}),
    module_scope: currentModuleScope(),
  };
}

function withScopeBody(data) {
  return {
    ...(data || {}),
    module_scope: currentModuleScope(),
  };
}

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?redirect=${redirect}`;
    }
    return Promise.reject(err);
  }
);

export const notebookApi = {
  list: () => api.get('/notebooks', { params: withScopeParams() }),
  create: (data) => api.post('/notebooks', withScopeBody(data)),
  update: (id, data) => api.put(`/notebooks/${id}`, withScopeBody(data), { params: withScopeParams() }),
  delete: (id) => api.delete(`/notebooks/${id}`, { params: withScopeParams() }),
};

export const noteApi = {
  list: (params) => api.get('/notes', { params: withScopeParams(params) }),
  get: (id) => api.get(`/notes/${id}`, { params: withScopeParams() }),
  create: (data) => api.post('/notes', withScopeBody(data)),
  update: (id, data) => api.put(`/notes/${id}`, withScopeBody(data), { params: withScopeParams() }),
  delete: (id) => api.delete(`/notes/${id}`, { params: withScopeParams() }),
  calendar: (year, month) => api.get('/notes/calendar', { params: withScopeParams({ year, month }) }),
  stats: () => api.get('/notes/stats', { params: withScopeParams() }),
  historyToday: () => api.get('/notes/history-today', { params: withScopeParams() }),
  diaryTree: () => api.get('/notes/diary-tree', { params: withScopeParams() }),
  diarySummaries: (params) => api.get('/notes/diary-summaries', { params: withScopeParams(params) }),
  search: (params) => api.get('/notes/search', { params: withScopeParams(params) }),
  resolveLink: (name) => api.get('/notes/resolve-link', { params: withScopeParams({ name }) }),
  backlinks: (id, params) => api.get(`/notes/${id}/backlinks`, { params: withScopeParams(params) }),
  recycleList: (params) => api.get('/recycle/notes', { params: withScopeParams(params) }),
  restore: (id) => api.post(`/recycle/notes/${id}/restore`, null, { params: withScopeParams() }),
  purge: (id) => api.delete(`/recycle/notes/${id}/purge`, { params: withScopeParams() }),
  recycleClear: (params) => api.delete('/recycle/notes/clear', { params: withScopeParams(params) }),
};

export const todoApi = {
  list: (params) => api.get('/todos', { params }),
  create: (data) => api.post('/todos', data),
  update: (id, data) => api.put(`/todos/${id}`, data),
  delete: (id) => api.delete(`/todos/${id}`),
};

export const auditApi = {
  track: (data) => api.post('/audit/track', data),
};

export default api;
