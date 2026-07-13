import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

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

export const tradeApi = {
  list: (params) => api.get('/trades', { params }),
  count: (params) => api.get('/trades/count', { params }),
  searchOptions: (params) => api.get('/trades/search-options', { params }),
  get: (id) => api.get(`/trades/${id}`),
  riskPointHistory: (id) => api.get(`/trades/${id}/risk-point-history`),
  create: (data) => api.post('/trades', data),
  update: (id, data) => api.put(`/trades/${id}`, data),
  delete: (id) => api.delete(`/trades/${id}`),
  stats: (params) => api.get('/trades/statistics', { params }),
  analytics: (params) => api.get('/trades/analytics', { params }),
  importPaste: (data) => api.post('/trades/import-paste', data),
  positions: (params) => api.get('/trades/positions', { params }),
  sources: () => api.get('/trades/sources'),
  symbols: () => api.get('/trades/symbols'),
};

export const brokerApi = {
  list: () => api.get('/trade-brokers'),
  create: (data) => api.post('/trade-brokers', data),
  update: (id, data) => api.put(`/trade-brokers/${id}`, data),
  delete: (id) => api.delete(`/trade-brokers/${id}`),
};

export const tradePlanApi = {
  list: (params) => api.get('/trade-plans', { params }),
  get: (id) => api.get(`/trade-plans/${id}`),
  create: (data) => api.post('/trade-plans', data),
  update: (id, data) => api.put(`/trade-plans/${id}`, data),
  delete: (id) => api.delete(`/trade-plans/${id}`),
  upsertTradeLinks: (id, data) => api.put(`/trade-plans/${id}/trade-links`, data),
};

export const tradeReviewApi = {
  taxonomy: () => api.get('/trade-review-taxonomy'),
  get: (tradeId) => api.get(`/trades/${tradeId}/review`),
  upsert: (tradeId, data) => api.put(`/trades/${tradeId}/review`, data),
  delete: (tradeId) => api.delete(`/trades/${tradeId}/review`),
};

export const tradeSourceApi = {
  get: (tradeId) => api.get(`/trades/${tradeId}/source-metadata`),
  upsert: (tradeId, data) => api.put(`/trades/${tradeId}/source-metadata`, data),
};

export const tradeLinkedPlanApi = {
  get: (tradeId) => api.get(`/trades/${tradeId}/linked-plans`),
};

export const recycleApi = {
  trades: {
    list: (params) => api.get('/recycle/trades', { params }),
    restore: (id) => api.post(`/recycle/trades/${id}/restore`),
    purge: (id) => api.delete(`/recycle/trades/${id}/purge`),
    clear: () => api.delete('/recycle/trades/clear'),
  },
  tradeBrokers: {
    list: (params) => api.get('/recycle/trade-brokers', { params }),
    restore: (id) => api.post(`/recycle/trade-brokers/${id}/restore`),
    purge: (id) => api.delete(`/recycle/trade-brokers/${id}/purge`),
    clear: () => api.delete('/recycle/trade-brokers/clear'),
  },
  tradePlans: {
    list: (params) => api.get('/recycle/trade-plans', { params }),
    restore: (id) => api.post(`/recycle/trade-plans/${id}/restore`),
    purge: (id) => api.delete(`/recycle/trade-plans/${id}/purge`),
    clear: () => api.delete('/recycle/trade-plans/clear'),
  },
};

export const researchApi = {
  folders: {
    list: () => api.get('/trades/research/folders'),
    create: (data) => api.post('/trades/research/folders', data),
    update: (id, data) => api.put(`/trades/research/folders/${id}`, data),
    delete: (id) => api.delete(`/trades/research/folders/${id}`),
  },
  documents: {
    list: (params) => api.get('/trades/research/documents', { params }),
    get: (id) => api.get(`/trades/research/documents/${id}`),
    create: (data) => api.post('/trades/research/documents', data),
    update: (id, data) => api.put(`/trades/research/documents/${id}`, data),
    delete: (id) => api.delete(`/trades/research/documents/${id}`),
    backlinks: (id) => api.get(`/trades/research/documents/${id}/backlinks`),
    resolveLink: (name) => api.get('/trades/research/resolve-link', { params: { name } }),
  },
  recycle: {
    list: () => api.get('/trades/research/recycle'),
    restore: (id) => api.post(`/trades/research/recycle/${id}/restore`),
    purge: (id) => api.delete(`/trades/research/recycle/${id}/purge`),
    clear: () => api.delete('/trades/research/recycle'),
  },
};

export default api;
