# 🏦 Payment Gateway

Modern ve güvenli ödeme gateway sistemi - Türk bankalarının test ortamları ile uyumlu, kapsamlı merchant yönetim paneli ile.

## 🚀 Özellikler

- ✅ **Spring Boot** backend API 
- ✅ **React + TypeScript + Material-UI** modern frontend dashboard
- ✅ **PostgreSQL** veritabanı ile ACID uyumlu veri saklama
- ✅ **Multi-bank integration** - Garanti, İş Bankası, Yapı Kredi desteği
- ✅ **Comprehensive webhook system** with retry mechanism
- ✅ **Advanced dispute management** workflow
- ✅ **Refund processing** with partial refund support
- ✅ **Real-time analytics dashboard** with payment statistics
- ✅ **Merchant authentication** via API keys
- ✅ **Fraud detection** with IP and User-Agent analysis
- ✅ **Audit logging** for compliance and debugging
- ✅ **Scheduled tasks** for webhook retries and refund status updates

## 📁 Proje Yapısı

```
payment-gateway/
├── backend/                   # Spring Boot Backend
│   ├── src/main/java/com/payment/gateway/
│   │   ├── adapter/          # Bank integration adapters
│   │   │   ├── AbstractBankAdapter.java
│   │   │   ├── BankAdapter.java
│   │   │   └── impl/
│   │   │       ├── GarantiBankAdapter.java
│   │   │       ├── IsBankAdapter.java
│   │   │       └── YapiKrediBankAdapter.java
│   │   ├── config/           # Application configuration
│   │   │   ├── AsyncConfig.java
│   │   │   ├── CacheConfig.java
│   │   │   ├── CorsConfig.java
│   │   │   ├── SecurityConfig.java
│   │   │   └── RestTemplateConfig.java
│   │   ├── controller/       # REST API endpoints
│   │   │   ├── PaymentController.java
│   │   │   ├── RefundController.java
│   │   │   ├── DisputeController.java
│   │   │   ├── WebhookController.java
│   │   │   ├── MerchantController.java
│   │   │   └── AdminController.java
│   │   ├── service/          # Business logic layer
│   │   │   ├── PaymentService.java
│   │   │   ├── RefundService.java
│   │   │   ├── DisputeService.java
│   │   │   ├── WebhookService.java
│   │   │   ├── MerchantService.java
│   │   │   └── RiskAssessmentService.java
│   │   ├── model/            # JPA entities
│   │   │   ├── Payment.java
│   │   │   ├── Refund.java
│   │   │   ├── Dispute.java
│   │   │   ├── Webhook.java
│   │   │   └── Merchant.java
│   │   ├── dto/              # Data transfer objects
│   │   ├── repository/       # Data access layer
│   │   ├── scheduler/        # Background task scheduling
│   │   └── util/             # Utility classes
│   ├── pom.xml
│   └── mvnw
├── dashboard/                 # React Frontend Dashboard
│   ├── src/
│   │   ├── components/       # React components
│   │   │   ├── auth/         # Authentication components
│   │   │   ├── common/       # Shared UI components
│   │   │   ├── layout/       # Layout components
│   │   │   ├── payments/     # Payment management
│   │   │   ├── refunds/      # Refund management
│   │   │   └── disputes/     # Dispute management
│   │   ├── contexts/         # React contexts
│   │   ├── pages/            # Page components
│   │   ├── services/         # API integration
│   │   ├── types/            # TypeScript type definitions
│   │   └── utils/            # Utility functions
│   ├── package.json
│   └── tsconfig.json
└── README.md
```

## 🛠️ Kurulum

### Gereksinimler
- Java 17+
- Node.js 18+
- PostgreSQL 13+
- Maven 3.8+
- Redis (optional, for caching)

### 1. Veritabanı Kurulumu
```bash
# PostgreSQL'e bağlan
psql -U postgres

# Veritabanı oluştur
CREATE DATABASE payment_gateway;
CREATE USER payment_user WITH PASSWORD 'payment_pass';
GRANT ALL PRIVILEGES ON DATABASE payment_gateway TO payment_user;
```

### 2. Backend Kurulumu
```bash
cd backend
./mvnw clean install
./mvnw spring-boot:run
```

Backend çalışacak: `http://localhost:8080`

### 3. Frontend Dashboard Kurulumu
```bash
cd dashboard
npm install
npm start
```

Dashboard çalışacak: `http://localhost:3000`

## 🧪 Test Etme

### API Test (curl)
```bash
# Başarılı ödeme
curl -X POST http://localhost:8080/v1/payments \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{
    "merchantId": "MERCH001",
    "customerId": "CUST001",
    "amount": 100.00,
    "currency": "TRY",
    "paymentMethod": "CREDIT_CARD",
    "cardNumber": "4824940000000014",
    "cardHolderName": "TEST KULLANICI",
    "expiryDate": "12/25",
    "cvv": "314",
    "description": "Test ödeme"
  }'
```

### Türk Bankası Test Kartları

#### Garanti BBVA
- ✅ **Başarılı**: `4824 9400 0000 0014` (12/25, CVV: 314)
- ❌ **Yetersiz Bakiye**: `4824 9400 0000 0022` (12/25, CVV: 322)
- 🔐 **3D Secure**: `4824 9400 0000 0030` (12/25, CVV: 330)

#### İş Bankası
- ✅ **Başarılı**: `4508 0345 0803 4509` (01/25, CVV: 123)
- ❌ **Hatalı**: `4508 0345 0803 4517` (01/25, CVV: 123)

#### Yapı Kredi
- ✅ **Başarılı**: `4508 0345 0803 4509` (01/25, CVV: 123)

### Dashboard Test
1. `http://localhost:3000` adresine git
2. Merchant hesabı ile giriş yap
3. Dashboard'da ödeme istatistiklerini görüntüle
4. Test ödemeleri oluştur ve sonuçları takip et

## 🔗 API Endpoints

### Core Payment Operations
- `POST /v1/payments` - Ödeme oluştur
- `GET /v1/payments/{id}` - Ödeme detayı
- `GET /v1/payments` - Ödeme listesi (filtreleme ile)
- `GET /v1/payments/customer/{customerId}` - Müşteri ödemeleri
- `GET /v1/payments/stats` - Ödeme istatistikleri

### Refund Management
- `POST /v1/refunds` - İade oluştur
- `GET /v1/refunds/{id}` - İade detayı
- `GET /v1/refunds` - İade listesi
- `GET /v1/refunds/stats` - İade istatistikleri

### Dispute Management
- `POST /v1/disputes` - İtiraz oluştur
- `GET /v1/disputes/{id}` - İtiraz detayı
- `GET /v1/disputes` - İtiraz listesi
- `PUT /v1/disputes/{id}/status` - İtiraz durumu güncelle
- `GET /v1/disputes/stats` - İtiraz istatistikleri

### Webhook Management
- `POST /v1/webhooks` - Webhook oluştur
- `GET /v1/webhooks/{id}` - Webhook detayı
- `GET /v1/webhooks` - Webhook listesi
- `POST /v1/webhooks/delivery` - Webhook gönder
- `GET /v1/webhooks/delivery/{id}` - Webhook delivery durumu

### Merchant Management
- `POST /v1/merchants` - Merchant oluştur
- `GET /v1/merchants/{id}` - Merchant detayı
- `PUT /v1/merchants/{id}` - Merchant güncelle
- `GET /v1/merchants/{id}/payments` - Merchant ödemeleri

### Authentication
- `POST /v1/auth/login` - Merchant girişi
- `POST /v1/auth/register` - Merchant kaydı
- `GET /v1/auth/me` - Mevcut kullanıcı bilgisi

## 🔐 Güvenlik Özellikleri

- **API Key Authentication**: Her merchant için benzersiz API key
- **Merchant Isolation**: Merchant'lar sadece kendi verilerine erişebilir
- **Input Validation**: Kapsamlı veri doğrulama (Bean Validation)
- **SQL Injection Prevention**: JPA ile güvenli veritabanı erişimi
- **Audit Logging**: Tüm işlemler için detaylı log kayıtları
- **Rate Limiting**: API abuse önleme
- **IP-based Fraud Detection**: Şüpheli IP adreslerini tespit etme

## 📊 Dashboard Özellikleri

### Real-time Analytics
- Ödeme hacmi ve başarı oranları
- Günlük, haftalık, aylık trend analizi
- Müşteri bazlı ödeme istatistikleri
- İade ve itiraz oranları

### Payment Management
- Ödeme listesi ve detay görüntüleme
- Ödeme durumu takibi
- Filtreleme ve arama özellikleri
- Toplu işlem desteği

### Refund & Dispute Handling
- İade işlemleri yönetimi
- Müşteri itirazları takibi
- İtiraz yanıtlama sistemi
- Durum güncellemeleri

## 🏗️ Mimari Özellikler

### Backend Architecture
- **Layered Architecture**: Controller → Service → Repository → Model
- **Adapter Pattern**: Bank integration için esnek mimari
- **Strategy Pattern**: Farklı ödeme yöntemleri için
- **Observer Pattern**: Webhook notification sistemi

### Frontend Architecture
- **Component-based**: Modüler React component yapısı
- **Context API**: Global state management
- **Custom Hooks**: Reusable business logic
- **TypeScript**: Type safety ve geliştirici deneyimi

### Database Design
- **Normalized Schema**: Veri tutarlılığı için
- **Indexing Strategy**: Performans optimizasyonu
- **Audit Trail**: Compliance için detaylı kayıtlar

## 🚀 Performance Features

- **Async Processing**: Webhook delivery ve background tasks
- **Caching**: Redis ile performans optimizasyonu
- **Connection Pooling**: Veritabanı bağlantı yönetimi
- **Lazy Loading**: Frontend component optimizasyonu

## 🔧 Development Tools

- **Swagger/OpenAPI**: API documentation
- **Spring Boot DevTools**: Development experience
- **Hot Reload**: Frontend development
- **Comprehensive Logging**: Debugging ve monitoring

## 🌟 Katkıda Bulunma

1. Fork yapın
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Commit yapın (`git commit -m 'Add amazing feature'`)
4. Push yapın (`git push origin feature/amazing-feature`)
5. Pull Request açın

## 📝 License

Bu proje MIT License altında lisanslanmıştır.

## 📞 İletişim

Proje ile ilgili sorularınız için issue açabilirsiniz.

---

**Not**: Bu proje production-ready bir ödeme gateway sistemidir. Türk bankalarının test ortamları ile entegre edilmiştir ve kapsamlı güvenlik önlemleri içermektedir.
