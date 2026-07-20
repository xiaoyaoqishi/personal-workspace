import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const CHINA_TIMEZONE = 'Asia/Shanghai';
const EXPLICIT_TIMEZONE_RE = /(?:[zZ]|[+-]\d{2}:?\d{2})$/;

export function backendTimeInChina(value) {
  if (value === null || value === undefined || value === '') return dayjs('');
  if (typeof value === 'string' && !EXPLICIT_TIMEZONE_RE.test(value.trim())) {
    return dayjs.utc(value).tz(CHINA_TIMEZONE);
  }
  return dayjs(value).tz(CHINA_TIMEZONE);
}

export function chinaNow() {
  return dayjs().tz(CHINA_TIMEZONE);
}
