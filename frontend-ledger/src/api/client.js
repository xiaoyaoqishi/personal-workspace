import axios from 'axios'

let notifyError = () => {}

export const setApiErrorNotifier = (notifier) => {
  notifyError = typeof notifier === 'function' ? notifier : () => {}
}

const extractErrorMessage = (error) => {
  const data = error?.response?.data
  if (!data) return ''
  if (typeof data === 'string') return data
  return data.detail || data.message || data.error || ''
}

const redirectLogin = () => {
  const redirect = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.href = `/login?redirect=${redirect}`
}

const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
})

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status
    const silentError = Boolean(error?.config?.meta?.silentError)

    if (status === 401) {
      redirectLogin()
      return Promise.reject(error)
    }

    const userMsg = status === 403 ? '无权限访问' : extractErrorMessage(error)
    if (userMsg) {
      error.userMessage = userMsg
      if (!silentError) notifyError(userMsg)
    }

    return Promise.reject(error)
  },
)

export default apiClient
