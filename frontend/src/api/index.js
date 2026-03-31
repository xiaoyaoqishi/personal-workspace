import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    }
    return Promise.reject(err);
  }
);

export const tradeApi = {
  list: (params) => api.get('/trades', { params }),
  get: (id) => api.get(`/trades/${id}`),
  create: (data) => api.post('/trades', data),
  update: (id, data) => api.put(`/trades/${id}`, data),
  delete: (id) => api.delete(`/trades/${id}`),
  stats: (params) => api.get('/trades/statistics', { params }),
};

export const reviewApi = {
  list: (params) => api.get('/reviews', { params }),
  get: (id) => api.get(`/reviews/${id}`),
  create: (data) => api.post('/reviews', data),
  update: (id, data) => api.put(`/reviews/${id}`, data),
  delete: (id) => api.delete(`/reviews/${id}`),
};

export default api;
