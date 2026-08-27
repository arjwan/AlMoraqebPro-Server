(function(){
'use strict';

let syncing=false;

function getToken(){
    return sessionStorage.getItem('almoraqeb_admin_token')||'';
}

function getCompanyId(){
    try{
        const s=JSON.parse(
            localStorage.getItem('almoraqeb_admin_session')||'{}'
        );

        return String(
            s.companyId ||
            localStorage.getItem('companyId') ||
            ''
        ).trim();
    }catch{
        return String(
            localStorage.getItem('companyId')||''
        ).trim();
    }
}

async function pendingCount(){
    if(!window.AlMoraqebOfflineDB) return 0;

    const rows=
        await AlMoraqebOfflineDB.getPendingOperations(
            getCompanyId()
        );

    return rows.length;
}

async function pullServerData(token){
    const companyId=getCompanyId();
    const resources=[
        {store:'employees',path:'/api/employees?companyId='+encodeURIComponent(companyId),key:'employees'},
        {store:'locations',path:'/api/admin/locations',key:'locations'},
        {store:'shifts',path:'/api/admin/shifts',key:'shifts'},
        {store:'salaries',path:'/api/admin/salaries',key:'salaries'},
        {store:'loans',path:'/api/admin/loans',key:'loans'},
        {store:'attendance',path:'/api/admin/attendance',key:'attendance'},
        {store:'serviceRequests',path:'/api/admin/service-requests',key:'requests'},
        {store:'supportRequests',path:'/api/admin/support-requests',key:'requests'}
    ];
    const snapshots=await Promise.all(resources.map(async item=>{
        const response=await fetch(item.path,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
        const data=await response.json().catch(()=>({}));
        if(!response.ok||data.success===false) throw new Error(data.message||data.error||('HTTP '+response.status));
        return {...item,records:Array.isArray(data[item.key])?data[item.key]:[]};
    }));
    for(const item of snapshots){
        await AlMoraqebOfflineDB.replaceCompanyData(
            AlMoraqebOfflineDB.STORES[item.store],companyId,item.records
        );
    }
    return snapshots.reduce((sum,item)=>sum+item.records.length,0);
}

async function status(){
    return {
        online:navigator.onLine,
        local:true,
        syncing,
        pending:await pendingCount(),
        lastSuccessfulSyncAt:window.AlMoraqebOfflineDB
            ? await AlMoraqebOfflineDB.getMeta('lastSuccessfulSyncAt')
            : null
    };
}

function emit(detail){
    document.dispatchEvent(
        new CustomEvent(
            'almoraqeb-sync-status',
            {detail}
        )
    );
}

async function queueOperation(path,method='POST',body={}){
    if(!window.AlMoraqebOfflineDB){
        throw new Error('قاعدة Offline غير جاهزة');
    }

    const id=
        await AlMoraqebOfflineDB.queueOperation({
            companyId:getCompanyId(),
            path,
            method,
            body
        });

    emit({
        online:navigator.onLine,
        syncing:false,
        pending:await pendingCount()
    });

    return id;
}

async function syncPending(){
    if(syncing) return;

    if(!navigator.onLine){
        emit({
            online:false,
            syncing:false,
            pending:await pendingCount()
        });
        return;
    }

    const token=getToken();

    if(!token) return;

    syncing=true;

    let successCount=0;
    let failedCount=0;
    let pulledCount=0;
    let fullySynced=false;

    try{
        const rows=
            await AlMoraqebOfflineDB.getPendingOperations(
                getCompanyId()
            );

        rows.sort(
            (a,b)=>Number(a.id||0)-Number(b.id||0)
        );

        emit({
            online:true,
            syncing:true,
            pending:rows.length
        });

        for(const row of rows){
            try{
                const r=await fetch(row.path,{
                    method:row.method,
                    headers:{
                        'Content-Type':'application/json',
                        Authorization:'Bearer '+token,
                        'X-AlMoraqeb-Sync':'offline'
                    },
                    body:
                        row.method==='GET'
                            ? undefined
                            : JSON.stringify(row.body??{}),
                    cache:'no-store'
                });

                const d=await r.json().catch(()=>({}));

                if(!r.ok){
                    row.attempts=
                        Number(row.attempts||0)+1;

                    row.lastError=
                        d.message ||
                        d.error ||
                        ('HTTP '+r.status);

                    row.lastAttemptAt=
                        new Date().toISOString();

                    await AlMoraqebOfflineDB
                        .updateQueuedOperation(row);

                    failedCount++;
                    continue;
                }

                await AlMoraqebOfflineDB
                    .deleteQueuedOperation(row.id);

                successCount++;

            }catch(err){
                row.attempts=
                    Number(row.attempts||0)+1;

                row.lastError=
                    err.message||'Network error';

                row.lastAttemptAt=
                    new Date().toISOString();

                await AlMoraqebOfflineDB
                    .updateQueuedOperation(row);

                failedCount++;

                if(!navigator.onLine) break;
            }
        }

        const remaining=await pendingCount();
        if(remaining===0&&failedCount===0){
            pulledCount=await pullServerData(token);
            fullySynced=true;
        }

    }catch(err){
        failedCount++;
        emit({online:navigator.onLine,local:true,syncing:false,pending:await pendingCount(),failedCount,error:err.message});
    }finally{
        syncing=false;

        const pending=
            await pendingCount();

        if(fullySynced){
            await AlMoraqebOfflineDB.setMeta(
                'lastSuccessfulSyncAt',
                new Date().toISOString()
            );
        }

        emit({
            online:navigator.onLine,
            syncing:false,
            pending,
            successCount,
            failedCount,
            pulledCount,
            fullySynced,
            local:true
        });
    }
}

window.addEventListener('online',()=>{
    setTimeout(syncPending,1200);
});

window.addEventListener('load',()=>{
    if(navigator.onLine){
        setTimeout(syncPending,2500);
    }
});

window.addEventListener('focus',()=>{
    if(navigator.onLine) syncPending();
});

setInterval(()=>{
    if(navigator.onLine) syncPending();
},60000);

window.AlMoraqebOfflineSync={
    queueOperation,
    syncPending,
    pendingCount,
    pullServerData,
    status
};

})();
