import SwiftUI
import CoreLocation
import LocalAuthentication

struct Employee: Decodable {
    let _id: String?
    let name: String?
    let companyId: String?
}
struct LoginReply: Decodable { let success: Bool; let message: String?; let employee: Employee? }
struct ChallengeReply: Decodable { let success: Bool; let challengeId: String?; let message: String? }
struct ActionReply: Decodable { let success: Bool; let message: String? }

@MainActor
final class AttendanceModel: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var company = ""
    @Published var username = ""
    @Published var password = ""
    @Published var employee: Employee?
    @Published var status = "سجّل الدخول للمتابعة"
    @Published var busy = false
    @Published var location: CLLocation?
    private let locator = CLLocationManager()
    private let base = URL(string: "https://almoraqebpro-server-aymo.onrender.com")!
    private let deviceKey = "almoraqeb_ios_device_id"
    var deviceId: String {
        if let value = UserDefaults.standard.string(forKey: deviceKey) { return value }
        let value = UUID().uuidString
        UserDefaults.standard.set(value, forKey: deviceKey)
        return value
    }
    override init() {
        super.init()
        locator.delegate = self
        locator.desiredAccuracy = kCLLocationAccuracyBest
    }
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        location = locations.last
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        status = "تعذر تحديد الموقع: \(error.localizedDescription)"
    }
    func requestLocation() {
        locator.requestWhenInUseAuthorization()
        locator.requestLocation()
    }
    private func request<T: Decodable>(_ path: String, body: [String: Any]? = nil) async throws -> T {
        var req = URLRequest(url: base.appendingPathComponent(path))
        req.timeoutInterval = 20
        if let body {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = (try? JSONDecoder().decode(ActionReply.self, from: data).message) ?? "خطأ من الخادم"
            throw NSError(domain: "AlMoraqebPro", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func login() async {
        busy = true; defer { busy = false }
        do {
            let result: LoginReply = try await request("api/mobile/login", body: [
                "companyId": company, "username": username, "password": password, "deviceId": deviceId
            ])
            guard result.success, let employee = result.employee else {
                status = result.message ?? "فشل الدخول"; return
            }
            self.employee = employee
            password = ""
            status = "مرحباً \(employee.name ?? "")"
            requestLocation()
        } catch { status = error.localizedDescription }
    }
    func record(_ type: String) async {
        guard let employee, let id = employee._id, let companyId = employee.companyId else { return }
        busy = true; defer { busy = false }
        do {
            guard let point = location, point.horizontalAccuracy >= 0, point.horizontalAccuracy <= 100,
                  abs(point.timestamp.timeIntervalSinceNow) < 60 else {
                requestLocation()
                status = "انتظر إحداثيات GPS دقيقة وحديثة ثم حاول مجدداً"; return
            }
            let context = LAContext()
            var error: NSError?
            guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
                status = "يتطلب الجهاز Face ID أو Touch ID مفعّلاً"; return
            }
            let verified = try await context.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics,
                                                             localizedReason: "تأكيد البصمة للحضور والانصراف")
            guard verified else { status = "لم يتم تأكيد الهوية"; return }
            let challenge: ChallengeReply = try await request("api/attendance/challenge?employeeId=\(id)&deviceId=\(deviceId)")
            guard challenge.success, let challengeId = challenge.challengeId else {
                status = challenge.message ?? "تعذر إنشاء تحدي البصمة"; return
            }
            let reply: ActionReply = try await request("api/attendance", body: [
                "employeeId": id, "companyId": companyId, "deviceId": deviceId,
                "challengeId": challengeId, "fingerprintToken": UUID().uuidString,
                "latitude": point.coordinate.latitude, "longitude": point.coordinate.longitude,
                "type": type, "timestamp": ISO8601DateFormatter().string(from: Date())
            ])
            status = reply.message ?? (reply.success ? "تم تسجيل العملية" : "لم تنجح العملية")
        } catch { status = error.localizedDescription }
    }
}

struct ContentView: View {
    @StateObject private var model = AttendanceModel()
    var body: some View {
        NavigationStack {
            Form {
                if model.employee == nil {
                    Section("دخول الموظف") {
                        TextField("رمز الشركة", text: $model.company)
                            .textInputAutocapitalization(.never)
                        TextField("اسم المستخدم", text: $model.username)
                            .textInputAutocapitalization(.never)
                        SecureField("كلمة المرور", text: $model.password)
                        Button("تسجيل الدخول") { Task { await model.login() } }
                            .disabled(model.busy || model.company.isEmpty || model.username.isEmpty || model.password.isEmpty)
                    }
                } else {
                    Section("الموظف") {
                        Text(model.employee?.name ?? "")
                        Button("تحديث الموقع") { model.requestLocation() }
                        Button("تسجيل الحضور") { Task { await model.record("attendance") } }.disabled(model.busy)
                        Button("تسجيل الانصراف") { Task { await model.record("departure") } }.disabled(model.busy)
                        Button("تسجيل الخروج") { model.employee = nil }
                    }
                }
                Section("الحالة") {
                    Text(model.status)
                    if let point = model.location {
                        Text("دقة GPS: \(Int(point.horizontalAccuracy)) متر")
                    }
                    if model.busy { ProgressView() }
                }
            }
            .navigationTitle("المراقب برو")
            .environment(\.layoutDirection, .rightToLeft)
        }
    }
}
