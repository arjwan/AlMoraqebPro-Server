# تطبيق AlMoraqeb Pro لسطح المكتب

تشغيل نسخة التطوير:

```bash
npm install
npm run desktop:dev
```

إنشاء حزم التثبيت للنظام الحالي:

```bash
npm run desktop:build
```

ينتج `AppImage` و`deb` على Linux، و`NSIS exe` على Windows، و`dmg` على macOS. يجب تنفيذ البناء على كل نظام مستهدف للحصول على حزمته الأصلية.

أوامر البناء المحددة:

```bash
npm run desktop:build:linux
npm run desktop:build:win
```

يفضل بناء Windows على Windows 11. البناء من Linux يحتاج Wine، وهو غير مثبت على
الجهاز الحالي؛ شغّل `npm run desktop:build:win` على Windows 11 لإنتاج NSIS.

يفتح التطبيق صفحة إدارة المراقب برو المنشورة `admin_login.html` داخل نافذة مستقلة بلا أشرطة متصفح، ويحافظ Electron على Cookies وSession أثناء التنقل. الروابط الخارجية تفتح في المتصفح الافتراضي، وفشل الاتصال يظهر كخطأ حقيقي. يمكن تغيير الرابط عبر `ALMORAQEB_APP_URL`.
