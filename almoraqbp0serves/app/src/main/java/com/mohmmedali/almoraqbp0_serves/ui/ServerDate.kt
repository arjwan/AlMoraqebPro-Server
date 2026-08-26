package com.mohmmedali.almoraqebpro.ui

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val serverDateFormatter = DateTimeFormatter
    .ofPattern("yyyy/MM/dd HH:mm")
    .withZone(ZoneId.systemDefault())

fun formatServerDate(value: String?): String {
    if (value.isNullOrBlank()) return ""
    return runCatching {
        serverDateFormatter.format(Instant.parse(value))
    }.getOrElse { value }
}
