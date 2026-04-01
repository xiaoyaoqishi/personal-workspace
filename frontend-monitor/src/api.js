import axios from 'axios';

const api = axios.create({ baseURL: '/api/monitor' });

export function fetchRealtime() {
  return api.get('/realtime');
}

export function fetchHistory() {
  return api.get('/history');
}
