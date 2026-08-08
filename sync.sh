#!/bin/bash

echo "🚀 جاري التحقق من التغييرات المحلية لرفعها..."
git add .

# التحقق مما إذا كان هناك تغييرات تستحق الرفع
if ! git diff-index --quiet HEAD --; then
    git commit -m "Auto-sync update: $(date +'%Y-%m-%d %H:%M:%S')"
    echo "📤 جاري الرفع إلى GitHub وRender..."
    git push origin main
    echo "✅ تم الرفع بنجاح!"
else
    echo "ℹ️ لا توجد تغييرات محلية جديدة للرفع."
fi

echo "🔄 جاري التحقق من التحديثات وسحبها من GitHub..."
git pull origin main

echo "📥 جاري جلب أحدث بيانات الموظفين من السحابة (Render)..."
curl -s "https://your-app-name.onrender.com/api/v1/employees" > cloud_backup.json

echo "✨ تمت عملية المزامنة (الرفع والجلب) بنجاح!"
