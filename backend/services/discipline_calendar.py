"""Verified Mainland China holiday dates; weekends always excluded by product policy.

Sources: State Council notices 国办发明电〔2025〕7号 /〔2026〕10号.
https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm
https://www.gov.cn/zhengce/content/202611/content_7085101.htm
Unknown years deliberately have no statistical classification.
"""
from datetime import date, timedelta

HOLIDAY_RANGES = {
    2026: [('01-01', '01-03'), ('02-15', '02-23'), ('04-04', '04-06'),
           ('05-01', '05-05'), ('06-19', '06-21'), ('09-25', '09-27'), ('10-01', '10-07')],
    2027: [('01-01', '01-03'), ('02-05', '02-13'), ('04-03', '04-05'),
           ('05-01', '05-05'), ('06-09', '06-09'), ('09-15', '09-15'), ('10-01', '10-07')],
}


def workday_reason(day: date):
    if day.weekday() >= 5:
        return 'weekend'
    if day.year not in HOLIDAY_RANGES:
        return 'unknown_calendar'
    value = day.strftime('%m-%d')
    if any(start <= value <= end for start, end in HOLIDAY_RANGES[day.year]):
        return 'holiday'
    return 'workday'


def month_dates(year, month):
    day = date(year, month, 1)
    while day.month == month:
        yield day
        day += timedelta(days=1)
