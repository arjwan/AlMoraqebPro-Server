let trackingIncidents = [];

function incidentLabel(value) {
    return ({ allowed: 'طبيعي / مسموح', warning: 'تنبيه', absence: 'غياب بقرار المدير',
        authorized: 'خروج بإذن / مهمة عمل', pending: 'بانتظار إجراء المدير' })[value] || 'بانتظار إجراء المدير';
}

function trackingTime(value) {
    return value ? new Date(value).toLocaleString('ar-IQ', { timeZone: 'Asia/Baghdad' }) : 'غير معروف';
}

function renderTrackingIncidents() {
    const host = $('trackingIncidents');
    if (!trackingIncidents.length) {
        host.innerHTML = '<div class="empty">لا توجد أحداث تتبع مسجلة.</div>';
        return;
    }
    host.innerHTML = trackingIncidents.slice(0, 60).map(item => {
        const id = esc(item._id);
        const ongoing = item.status === 'open';
        const seconds = Number(item.durationSeconds ??
            (new Date(ongoing ? Date.now() : item.endedAt) - new Date(item.startedAt)) / 1000);
        const details = item.kind === 'offsite'
            ? `أقصى ابتعاد: ${Math.round(Number(item.maxDistanceMeters || 0))} م`
            : `آخر بطارية: ${item.batteryPercent == null ? 'غير معروفة' : esc(item.batteryPercent) + '%'}`;
        const last = item.lastKnownLocation;
        const lastPoint = last?.latitude != null && last?.longitude != null
            ? `<small>آخر موقع: ${esc(Number(last.latitude).toFixed(6))}, ${esc(Number(last.longitude).toFixed(6))} — ${trackingTime(last.timestamp)}</small>`
            : '<small>لا يوجد موقع سابق مسجل</small>';
        return `<article class="tracking-card ${ongoing ? '' : 'closed'}" id="incident-${id}">
            <h3>${item.kind === 'offsite' ? '📍 خروج عن موقع العمل' : '📡 انقطاع GPS'} — ${esc(item.employeeName || 'موظف')}</h3>
            <p>البداية: ${trackingTime(item.startedAt)}</p>
            <p>${ongoing ? 'ما زال الحدث مستمرًا' : `العودة: ${trackingTime(item.endedAt)}`} · المدة: ${Math.max(0, Math.round(seconds / 60))} دقيقة</p>
            <p>${details}</p>${lastPoint}
            <p class="tracking-decision">${incidentLabel(item.managerDecision)}</p>
            <div class="tracking-form">
                <label>إجراء المدير
                    <select id="decision-${id}" onchange="trackingDecisionChanged('${id}')">
                        <option value="">اختر الإجراء</option>
                        <option value="allowed">طبيعي / مسموح</option>
                        <option value="warning">تنبيه</option>
                        <option value="absence">غياب لمدة محددة</option>
                        <option value="authorized">خروج بإذن / مهمة عمل</option>
                    </select>
                </label>
                <label id="from-wrap-${id}" hidden>من <input id="from-${id}" type="datetime-local"></label>
                <label id="to-wrap-${id}" hidden>إلى <input id="to-${id}" type="datetime-local"></label>
                <button class="btn blue" type="button" onclick="saveTrackingDecision('${id}')">حفظ الإجراء</button>
            </div>
        </article>`;
    }).join('');
}

function trackingDecisionChanged(id) {
    const visible = $('decision-' + id).value === 'absence';
    $('from-wrap-' + id).hidden = !visible;
    $('to-wrap-' + id).hidden = !visible;
}

async function loadTrackingIncidents() {
    try {
        const data = await get('/api/admin/tracking-incidents');
        trackingIncidents = data.incidents || [];
        renderTrackingIncidents();
    } catch (error) {
        $('trackingIncidents').innerHTML = `<div class="empty">تعذر تحميل أحداث التتبع: ${esc(error.message)}</div>`;
    }
}

function focusTrackingIncident(id) {
    const card = document.getElementById('incident-' + id);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else loadTrackingIncidents().then(() => document.getElementById('incident-' + id)?.scrollIntoView({ behavior: 'smooth' }));
}

async function saveTrackingDecision(id) {
    const decision = $('decision-' + id).value;
    if (!decision) return toast('اختر الإجراء أولًا', true);
    const body = { decision };
    if (decision === 'absence') {
        const from = $('from-' + id).value;
        const to = $('to-' + id).value;
        if (!from || !to || new Date(to) <= new Date(from)) {
            return toast('حدد مدة الغياب من وإلى بصورة صحيحة', true);
        }
        body.from = new Date(from).toISOString();
        body.to = new Date(to).toISOString();
    }
    try {
        const response = await fetch(API + '/api/admin/tracking-incidents/' + encodeURIComponent(id) + '/action', {
            method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || result.error || 'تعذر حفظ الإجراء');
        toast('تم حفظ قرار المدير');
        await loadTrackingIncidents();
    } catch (error) {
        toast(error.message, true);
    }
}
