import apiClient from './client'

export const listAssets = (params = {}) => apiClient.get('/ledger/assets', { params })
export const getAssetSummary = () => apiClient.get('/ledger/assets/summary')
export const getAsset = (id) => apiClient.get(`/ledger/assets/${id}`)
export const createAsset = (payload) => apiClient.post('/ledger/assets', payload)
export const updateAsset = (id, payload) => apiClient.put(`/ledger/assets/${id}`, payload)
export const deleteAsset = (id) => apiClient.delete(`/ledger/assets/${id}`)
export const listAssetEvents = (assetId) => apiClient.get(`/ledger/assets/${assetId}/events`)
export const createAssetEvent = (assetId, payload) => apiClient.post(`/ledger/assets/${assetId}/events`, payload)
export const deleteAssetEvent = (assetId, eventId) => apiClient.delete(`/ledger/assets/${assetId}/events/${eventId}`)
