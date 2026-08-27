# تطبيق AlMoraqeb Pro لسطح المكتب

تشغيل نسخة التطوير:

```bash
npm install
npm run desktop
```

إنشاء حزم التثبيت للنظام الحالي:

```bash
npm run desktop:build
```

ينتج `AppImage` و`deb` على Linux، و`NSIS exe` على Windows، و`dmg` على macOS. يجب تنفيذ البناء على كل نظام مستهدف للحصول على حزمته الأصلية.
