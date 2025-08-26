# Multi-Tenant Payment Gateway

Bu proje, her merchant'ın kendi verilerini görebileceği multi-tenant bir payment gateway sistemidir.

## 🏗️ Sistem Mimarisi

### Backend (Java Spring Boot)
- **MerchantContextService**: Her request'te hangi merchant'ın işlem yaptığını belirler
- **Merchant Isolation**: Her servis (Payment, Refund, Dispute) sadece ilgili merchant'ın verilerini döner
- **Admin Access**: Admin kullanıcılar tüm merchant verilerini görebilir

### Frontend (React TypeScript)
- **Merchant Selector**: Header'da merchant seçimi yapılabilir
- **Dynamic Dashboard**: Seçilen merchant'a göre dashboard içeriği değişir
- **Session Management**: Her merchant için ayrı session yönetimi

## 🔐 Kullanıcı Girişleri

### Test Merchant'ları

| Email | Şifre | Merchant ID | Açıklama |
|-------|-------|-------------|----------|
| `merchant@test.com` | `password` | `TEST_MERCHANT` | Test Merchant |
| `demo@store.com` | `demo123` | `DEMO_STORE` | Demo Store |
| `sample@shop.com` | `sample456` | `SAMPLE_SHOP` | Sample Shop |
| `admin@cashflix.com` | `admin123` | `ADMIN_MERCHANT` | Admin Dashboard |

## 🚀 Nasıl Kullanılır

### 1. Backend'i Başlat
```bash
cd backend
mvn spring-boot:run
```

### 2. Database'i Hazırla
```bash
# PostgreSQL'de create_merchant.sql dosyasını çalıştır
psql -U postgres -d payment_gateway -f create_merchant.sql
```

### 3. Frontend'i Başlat
```bash
cd dashboard
npm install
npm start
```

### 4. Merchant Olarak Giriş Yap
1. `demo@store.com` / `demo123` ile giriş yap
2. Sadece Demo Store'a ait ödemeler, refund'lar ve dispute'lar görünür
3. Header'daki merchant selector'dan farklı merchant seç
4. Dashboard otomatik olarak yeni merchant'ın verilerini gösterir

## 🔒 Güvenlik Özellikleri

### Merchant Isolation
- Her merchant sadece kendi verilerini görebilir
- API key'ler merchant'a özeldir
- Cross-merchant data access engellenir

### Admin Access
- Admin kullanıcılar tüm merchant verilerini görebilir
- `/api/admin/*` endpoint'leri sadece admin'lere açık
- Admin API key'leri `pk_admin_` ile başlar

## 📊 API Endpoints

### Merchant Endpoints (Isolated)
```
GET /api/payments          # Sadece kendi ödemeleri
GET /api/refunds           # Sadece kendi refund'ları
GET /api/disputes          # Sadece kendi dispute'ları
```

### Admin Endpoints (All Data)
```
GET /api/admin/payments    # Tüm ödemeler
GET /api/admin/refunds     # Tüm refund'lar
GET /api/admin/disputes    # Tüm dispute'lar
GET /api/admin/merchants   # Tüm merchant'lar
```

## 🧪 Test Senaryoları

### Senaryo 1: Normal Merchant
1. `demo@store.com` ile giriş yap
2. Sadece Demo Store verilerini gör
3. Farklı merchant seç, veriler değişsin

### Senaryo 2: Admin Access
1. `admin@cashflix.com` ile giriş yap
2. Tüm merchant verilerini gör
3. Her merchant'ın detaylarını incele

### Senaryo 3: Data Isolation
1. `merchant@test.com` ile giriş yap
2. Test Merchant verilerini gör
3. Demo Store verilerine erişemeyeceğini doğrula

## 🔧 Geliştirme

### Yeni Merchant Ekleme
1. `create_merchant.sql` dosyasına yeni merchant ekle
2. Frontend'de `demoMerchants` array'ine ekle
3. Test et

### Yeni Servis Ekleme
1. `MerchantContextService` dependency'sini ekle
2. `getAll*` metodlarında merchant isolation uygula
3. Admin endpoint'i ekle

## 📝 Notlar

- Her merchant'ın kendi API key'i vardır
- Session'lar merchant bazında yönetilir
- Admin kullanıcılar tüm verileri görebilir
- Database'de tüm veriler saklanır ama görünüm merchant'a göre filtrelenir

## 🚨 Dikkat Edilecekler

- API key'ler güvenli şekilde saklanmalı
- Merchant isolation her endpoint'te kontrol edilmeli
- Admin yetkileri sıkı kontrol edilmeli
- Cross-site scripting (XSS) koruması eklenmeli

