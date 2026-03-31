import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export const notebookApi = {
  list: () => api.get('/notebooks'),
  create: (data) => api.post('/notebooks', data),
  update: (id, data) => api.put(`/notebooks/${id}`, data),
  delete: (id) => api.delete(`/notebooks/${id}`),
};

export const noteApi = {
  list: (params) => api.get('/notes', { params }),
  get: (id) => api.get(`/notes/${id}`),
  create: (data) => api.post('/notes', data),
  update: (id, data) => api.put(`/notes/${id}`, data),
  delete: (id) => api.delete(`/notes/${id}`),
  calendar: (year, month) => api.get('/notes/calendar', { params: { year, month } }),
};

export default api;
