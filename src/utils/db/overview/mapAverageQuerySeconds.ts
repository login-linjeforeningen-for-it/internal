import { AVERAGE_QUERY_FIELDS } from './constants.ts'
import toNullableSeconds from './toNullableSeconds.ts'

export default function mapAverageQuerySeconds(row?: QueryResultRow): AverageQuerySeconds {
    return {
        lastMinute: toNullableSeconds(row?.[AVERAGE_QUERY_FIELDS.lastMinute]),
        lastFiveMinutes: toNullableSeconds(row?.[AVERAGE_QUERY_FIELDS.lastFiveMinutes]),
        lastHour: toNullableSeconds(row?.[AVERAGE_QUERY_FIELDS.lastHour]),
        lastDay: toNullableSeconds(row?.[AVERAGE_QUERY_FIELDS.lastDay]),
    }
}
