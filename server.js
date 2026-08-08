const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());

// الرابط الخاص بك مع بيانات الاتصال المدمجة
const MONGO_URI = "mongodb+srv://mohmmed1628:0780moh780@cluster0.oomto7r.mongodb.net/AlMoraqebPro?retryWrites=true&w=majority&appName=Cluster0";

// الاتصال بقاعدة البيانات
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ تم الاتصال بقاعدة البيانات السحابية بنجاح'))
  .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// هيكل بيانات الشركات
const CompanySchema = new mongoose.Schema({
    companyId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    phone: String,
    address: String
}, { timestamps: true });

const Company = mongoose.model('Company', CompanySchema);

// 1. مسار الصفحة الرئيسية للتأكد أن السيرفر يعمل
app.get('/', (req, res) => {
    res.send('🚀 AlMoraqebPro Server is Running and Connected to MongoDB Atlas successfully!');
});

// 2. مسار جلب الشركات
app.get('/api/developer/companies', async (req, res) => {
    try {
        const companies = await Company.find();
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch data" });
    }
});

// 3. مسار حفظ وتحديث الشركات
app.post('/api/developer/company/create', async (req, res) => {
    const newCompany = req.body;
    try {
        await Company.findOneAndUpdate(
            { companyId: newCompany.companyId },
            newCompany,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        res.json({ success: true, message: "تم الحفظ بشكل دائم في السحابة" });
    } catch (error) {
        res.status(500).json({ error: "Failed to save data" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
