'use strict';

/**
 * AlMoraqebPro interview demo seed.
 * Adds isolated demo employees, shifts and attendance to an EXISTING interview company.
 * Idempotent: safe to run repeatedly; records use DEMO identifiers.
 *
 * Deployment refresh: developer credential secret sync.
 * Deployment refresh: map performance sync.
 * Usage: DEMO_COMPANY_ID=B-3214 DEMO_EMPLOYEE_COUNT=30 node scripts/seed-interview-demo.js
 */
require('dotenv').config();
const mongoose=require('mongoose');
const crypto=require('crypto');
const mongo=process.env.MONGODB_URI||process.env.MONGO_URI;
const BATCH=String(process.env.DEMO_BATCH||'interview-2026-09').trim();
const EMPLOYEES=Math.max(12,Math.min(80,Number(process.env.DEMO_EMPLOYEE_COUNT||30)));
const schema=(collection)=>new mongoose.Schema({}, {strict:false,collection});
const Company=mongoose.model('InterviewDemoCompany',schema('companies'));
const Employee=mongoose.model('InterviewDemoEmployee',schema('employees'));
const Shift=mongoose.model('InterviewDemoShift',schema('shifts'));
const Attendance=mongoose.model('InterviewDemoAttendance',schema('attendances'));

// Default interview target: B-3214 (شركة الارجوان للبرمجيات). Override only when explicitly requested.
const companyId=String(process.env.DEMO_COMPANY_ID||'B-3214').trim();
const locations=[
 {id:'HQ',name:'المقر الرئيسي - بغداد',type:'headquarters',province:'بغداد',fullAddress:'بغداد - الكرادة',latitude:33.3024,longitude:44.4001,radiusMeters:220},
 {id:'B1',name:'فرع المنصور',type:'branch',province:'بغداد',fullAddress:'بغداد - المنصور',latitude:33.3158,longitude:44.3367,radiusMeters:200},
 {id:'B2',name:'فرع زيونة',type:'branch',province:'بغداد',fullAddress:'بغداد - زيونة',latitude:33.3246,longitude:44.4545,radiusMeters:200},
 {id:'W1',name:'موقع مشروع الجادرية',type:'project',province:'بغداد',fullAddress:'بغداد - الجادرية',latitude:33.2786,longitude:44.3838,radiusMeters:260},
 {id:'WH',name:'مخزن الدورة',type:'warehouse',province:'بغداد',fullAddress:'بغداد - الدورة',latitude:33.2490,longitude:44.3905,radiusMeters:240}
];
const shifts=[
 {key:'M',name:'صباحي',attendanceStart:'07:30',attendanceEnd:'08:30',lateFrom:'08:01',lateTo:'08:30',departureStart:'15:30',departureEnd:'16:30',overtimeStart:'16:31',overtimeEnd:'20:00'},
 {key:'E',name:'مسائي',attendanceStart:'14:30',attendanceEnd:'15:30',lateFrom:'15:01',lateTo:'15:30',departureStart:'22:30',departureEnd:'23:30',overtimeStart:'23:31',overtimeEnd:'23:59'},
 {key:'N',name:'ليلي',attendanceStart:'22:30',attendanceEnd:'23:30',lateFrom:'23:01',lateTo:'23:30',departureStart:'06:30',departureEnd:'07:30',overtimeStart:'07:31',overtimeEnd:'10:00'},
 {key:'F',name:'مرن',attendanceStart:'08:00',attendanceEnd:'10:00',lateFrom:'09:31',lateTo:'10:00',departureStart:'16:00',departureEnd:'19:00',overtimeStart:'19:01',overtimeEnd:'22:00'}
];
const first=['علي','زهراء','حيدر','نور','مصطفى','مريم','حسن','سارة','كرار','شهد','سجاد','زينب','مهدي','رؤى','أحمد','بتول','عباس','هدى','منتظر','غدير'];
const family=['التميمي','الجبوري','الشمري','الربيعي','العزاوي','العبيدي','اللامي','الساعدي','الأسدي','الموسوي'];
const jobs=['محاسب','موظف مبيعات','مسؤول مخزن','مندوب','مشرف موقع','موظف إداري','فني','سائق','مسؤول خدمة','مسؤول موارد بشرية'];
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,16);

(async()=>{
 if(!mongo)throw Error('MONGODB_URI/MONGO_URI is required');
 await mongoose.connect(mongo);
 try{
  const company=await Company.findOne({companyId}).lean();
  if(!company)throw Error('Target company not found: '+companyId);
  const companyName=String(company.name||'شركة الارجوان للبرمجيات');


  const employees=[];
  for(let i=0;i<EMPLOYEES;i++){
   const loc=locations[i%locations.length],sh=shifts[i%shifts.length],serial=`DEMO-${String(i+1).padStart(4,'0')}`;
   const name=`${first[i%first.length]} ${family[(i*3)%family.length]}`;
   const doc={companyId,companyName,name,email:`employee${i+1}@demo.invalid`,
    phoneNumber:'',salary:650000+(i%7)*75000,wageType:'monthly',shift:sh.name,socialSecurity:i%4===0?'غير مسجل':'مسجل',
    employeeSerial:serial,clientOfflineId:`${BATCH}-${companyId}-${serial}`,workHours:8,specialty:jobs[i%jobs.length],workplace:loc.name,
    username:`demo_${companyId.toLowerCase().replace(/[^a-z0-9]+/g,'_')}_${String(i+1).padStart(3,'0')}`,password:hash(BATCH+serial),credentialsStatus:'active',
    employmentStatus:'active',location:loc.name,province:loc.province,city:'بغداد',branch:loc.name,
    hireDate:new Date(Date.now()-(90+i*13)*86400000),demoData:true,demoBatch:BATCH,
    lastKnownLocation:{latitude:loc.latitude+(i%3)*0.00015,longitude:loc.longitude+(i%4)*0.00012,accuracyMeters:8+(i%12),timestamp:new Date()}};
   const r=await Employee.findOneAndUpdate({companyId,employeeSerial:serial},{$set:doc},{upsert:true,new:true});
   employees.push({doc:r,loc,sh});
  }

  for(const sh of shifts){
   const assigned=employees.filter((_,i)=>shifts[i%shifts.length].key===sh.key);
   const loc=locations[sh.key==='M'?0:sh.key==='E'?1:sh.key==='N'?4:3];
   await Shift.updateOne({companyId,clientOfflineId:`${BATCH}-${companyId}-SHIFT-${sh.key}`},{$set:{
    companyId,name:sh.name,branch:loc.name,locationId:loc.id,locationName:loc.name,
    latitude:loc.latitude,longitude:loc.longitude,radiusMeters:loc.radiusMeters,
    employeeIds:assigned.map(x=>String(x.doc._id)),...sh,clientOfflineId:`${BATCH}-${companyId}-SHIFT-${sh.key}`,demoData:true,demoBatch:BATCH
   }},{upsert:true});
  }

  const today=new Date(); today.setHours(0,0,0,0);
  await Attendance.deleteMany({companyId,demoData:true,demoBatch:BATCH,timestamp:{$gte:today}});
  let attendance=0;
  for(let i=0;i<employees.length;i++){
   const {doc,loc,sh}=employees[i];
   if(i%11===0)continue; // a few absences for reports
   const late=i%7===0, hour=sh.name==='مسائي'?15:sh.name==='ليلي'?23:8;
   const at=new Date(today);at.setHours(hour,late?18:((i*3)%12),0,0);
   await Attendance.create({employeeId:String(doc._id),companyId,deviceId:`DEMO-DEVICE-${i+1}`,verificationMethod:'device-biometric',
    shiftName:sh.name,workplace:loc.name,latitude:loc.latitude+(i%3)*0.0001,longitude:loc.longitude+(i%2)*0.0001,
    timestamp:at,type:'attendance',employeeName:doc.name,attendanceStatus:'normal',locationStatus:'approved',
    timeStatus:late?'late':'within-shift',lateMinutes:late?18:0,managerApprovalStatus:'not-required',demoData:true,demoBatch:BATCH});
   attendance++;
  }
  console.log(JSON.stringify({ok:true,batch:BATCH,company:companyId,companyName,companyRecordUntouched:true,locationsUsed:locations.length,shifts:shifts.length,employees:employees.length,attendanceToday:attendance},null,2));
 }finally{await mongoose.disconnect()}
})().catch(e=>{console.error(e);process.exit(1)});
