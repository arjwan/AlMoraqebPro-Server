package com.mohmmedali.almoraqebpro

import android.app.Application
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat

class AlmoraqebApp : Application() {
    override fun onCreate() {
        super.onCreate()
        val prefs = getSharedPreferences("almoraqeb_prefs", MODE_PRIVATE)
        AppCompatDelegate.setDefaultNightMode(
            prefs.getInt("app_theme_mode", AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        )
        val language = prefs.getString("app_language", "ar") ?: "ar"
        AppCompatDelegate.setApplicationLocales(
            LocaleListCompat.forLanguageTags(language)
        )
    }
}
