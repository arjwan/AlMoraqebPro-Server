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

يفتح التطبيق واجهة `public/` المحلية المضمّنة داخل نافذة مستقلة بلا أشرطة متصفح، ويحافظ Electron على Cookies وSession أثناء التنقل. طلبات `/api` تمرر إلى السيرفر الحقيقي عند توفر الإنترنت، بينما تبقى الواجهة والبيانات المحلية متاحة عند انقطاعه. الروابط الخارجية تفتح في المتصفح الافتراضي، ويمكن تغيير عنوان السيرفر عبر `ALMORAQEB_APP_URL`.
