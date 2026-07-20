import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'

dayjs.extend(utc)
dayjs.extend(timezone)

const CHINA_TIMEZONE = 'Asia/Shanghai'
const EXPLICIT_TIMEZONE_RE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/

export const backendTimeInChina = (value) => {
  if (value === null || value === undefined || value === '') return dayjs('')
  if (typeof value === 'string' && !EXPLICIT_TIMEZONE_RE.test(value.trim())) {
    return dayjs.utc(value).tz(CHINA_TIMEZONE)
  }
  return dayjs(value).tz(CHINA_TIMEZONE)
}

export const formatDate = (value) => {
  if (!value) return '-'
  const d = dayjs(value)
  return d.isValid() ? d.format('YYYY-MM-DD') : '-'
}

export const formatDateTime = (value) => {
  if (!value) return '-'
  const d = backendTimeInChina(value)
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : '-'
}

export const getDefaultLast30DaysRange = () => {
  const end = dayjs().endOf('day')
  const start = end.subtract(29, 'day').startOf('day')
  return [start, end]
}
