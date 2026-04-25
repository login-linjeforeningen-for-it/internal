export const FIELD_SEPARATOR = '\u001f'
export const RECORD_SEPARATOR = '\u001e'

export const AVERAGE_QUERY_FIELDS = {
    lastMinute: 'avg_last_minute_seconds',
    lastFiveMinutes: 'avg_last_five_minutes_seconds',
    lastHour: 'avg_last_hour_seconds',
    lastDay: 'avg_last_day_seconds',
} as const
