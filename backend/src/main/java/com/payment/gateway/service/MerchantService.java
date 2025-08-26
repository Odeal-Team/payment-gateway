package com.payment.gateway.service;

import com.payment.gateway.dto.MerchantRequest;
import com.payment.gateway.dto.MerchantResponse;
import com.payment.gateway.dto.MerchantUpdateRequest;
import com.payment.gateway.dto.MerchantStatusRequest;
import com.payment.gateway.dto.ApiKeyResponse;
import com.payment.gateway.model.Merchant;
import com.payment.gateway.model.AuditLog;
import com.payment.gateway.repository.MerchantRepository;
import com.payment.gateway.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class MerchantService {
    
    private final MerchantRepository merchantRepository;
    private final AuditService auditService;
    private final MerchantAuthService merchantAuthService;
    
    /**
     * Tüm merchant'ları listele
     */
    public List<MerchantResponse> getAllMerchants() {
        List<Merchant> merchants = merchantRepository.findAll();
        return merchants.stream()
                .map(MerchantResponse::fromEntity)
                .collect(Collectors.toList());
    }
    
    /**
     * ID ile merchant bul
     */
    public Optional<MerchantResponse> getMerchantById(Long id) {
        return merchantRepository.findById(id)
                .map(MerchantResponse::fromEntity);
    }
    
    /**
     * Merchant ID ile merchant bul
     */
    public Optional<MerchantResponse> getMerchantByMerchantId(String merchantId) {
        return merchantRepository.findByMerchantId(merchantId)
                .map(MerchantResponse::fromEntity);
    }
    
    /**
     * Status'e göre merchant'ları listele
     */
    public List<MerchantResponse> getMerchantsByStatus(Merchant.MerchantStatus status) {
        List<Merchant> merchants = merchantRepository.findByStatus(status);
        return merchants.stream()
                .map(MerchantResponse::fromEntity)
                .collect(Collectors.toList());
    }
    
    /**
     * Aktif merchant'ları listele
     */
    public List<MerchantResponse> getActiveMerchants() {
        List<Merchant> merchants = merchantRepository.findActiveMerchants();
        return merchants.stream()
                .map(MerchantResponse::fromEntity)
                .collect(Collectors.toList());
    }
    
    /**
     * Yeni merchant oluştur
     */
    @Transactional
    public MerchantResponse createMerchant(MerchantRequest request) {
        // Merchant ID benzersizlik kontrolü
        if (merchantRepository.existsByMerchantId(request.getMerchantId())) {
            throw new RuntimeException("Bu Merchant ID zaten kullanılıyor: " + request.getMerchantId());
        }
        
        // Email benzersizlik kontrolü
        if (merchantRepository.existsByEmail(request.getEmail())) {
            throw new RuntimeException("Bu email adresi zaten kullanılıyor: " + request.getEmail());
        }
        
        Merchant merchant = request.toEntity();
        
        // API key ve secret key oluştur
        String apiKey = merchantAuthService.generateApiKey(request.getMerchantId());
        String secretKey = generateSecretKey();
        
        merchant.setApiKey(apiKey);
        merchant.setSecretKey(secretKey);
        merchant.setStatus(Merchant.MerchantStatus.ACTIVE);
        
        Merchant savedMerchant = merchantRepository.save(merchant);
        
        // Audit log
        auditService.createEvent()
                .eventType("MERCHANT_CREATED")
                .severity(AuditLog.Severity.LOW)
                .actor("system")
                .action("CREATE")
                .resourceType("MERCHANT")
                .resourceId(savedMerchant.getMerchantId())
                .additionalData("name", savedMerchant.getName())
                .additionalData("email", savedMerchant.getEmail())
                .complianceTag("PCI_DSS")
                .log();
        
        log.info("✅ Yeni merchant oluşturuldu: {} - {}", savedMerchant.getMerchantId(), savedMerchant.getName());
        
        return MerchantResponse.fromEntity(savedMerchant);
    }
    
    /**
     * Merchant güncelle
     */
    @Transactional
    public Optional<MerchantResponse> updateMerchant(String merchantId, MerchantUpdateRequest request) {
        Optional<Merchant> merchantOpt = merchantRepository.findByMerchantId(merchantId);
        
        if (merchantOpt.isEmpty()) {
            return Optional.empty();
        }
        
        Merchant merchant = merchantOpt.get();
        
        // Email değişikliği varsa benzersizlik kontrolü
        if (request.getEmail() != null && !request.getEmail().equals(merchant.getEmail())) {
            if (merchantRepository.existsByEmail(request.getEmail())) {
                throw new RuntimeException("Bu email adresi zaten kullanılıyor: " + request.getEmail());
            }
        }
        
        // Güncelleme
        if (request.getName() != null) merchant.setName(request.getName());
        if (request.getEmail() != null) merchant.setEmail(request.getEmail());
        if (request.getPhone() != null) merchant.setPhone(request.getPhone());
        if (request.getAddress() != null) merchant.setAddress(request.getAddress());
        if (request.getWebsite() != null) merchant.setWebsite(request.getWebsite());
        if (request.getWebhookUrl() != null) merchant.setWebhookUrl(request.getWebhookUrl());
        if (request.getWebhookEvents() != null) merchant.setWebhookEvents(request.getWebhookEvents());
        
        Merchant updatedMerchant = merchantRepository.save(merchant);
        
        // Audit log
        auditService.createEvent()
                .eventType("MERCHANT_UPDATED")
                .severity(AuditLog.Severity.LOW)
                .actor("system")
                .action("UPDATE")
                .resourceType("MERCHANT")
                .resourceId(updatedMerchant.getMerchantId())
                .additionalData("updatedFields", request.toString())
                .complianceTag("PCI_DSS")
                .log();
        
        log.info("✅ Merchant güncellendi: {} - {}", updatedMerchant.getMerchantId(), updatedMerchant.getName());
        
        return Optional.of(MerchantResponse.fromEntity(updatedMerchant));
    }
    
    /**
     * Merchant status güncelle
     */
    @Transactional
    public Optional<MerchantResponse> updateMerchantStatus(String merchantId, MerchantStatusRequest request) {
        Optional<Merchant> merchantOpt = merchantRepository.findByMerchantId(merchantId);
        
        if (merchantOpt.isEmpty()) {
            return Optional.empty();
        }
        
        Merchant merchant = merchantOpt.get();
        Merchant.MerchantStatus oldStatus = merchant.getStatus();
        merchant.setStatus(request.getStatus());
        
        Merchant updatedMerchant = merchantRepository.save(merchant);
        
        // Audit log
        auditService.createEvent()
                .eventType("MERCHANT_STATUS_CHANGED")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("system")
                .action("UPDATE_STATUS")
                .resourceType("MERCHANT")
                .resourceId(updatedMerchant.getMerchantId())
                .additionalData("oldStatus", oldStatus.name())
                .additionalData("newStatus", request.getStatus().name())
                .additionalData("reason", request.getReason())
                .complianceTag("PCI_DSS")
                .log();
        
        log.info("✅ Merchant status güncellendi: {} - {} -> {}", 
                updatedMerchant.getMerchantId(), oldStatus, request.getStatus());
        
        return Optional.of(MerchantResponse.fromEntity(updatedMerchant));
    }
    
    /**
     * Merchant sil (soft delete - status SUSPENDED yap)
     */
    @Transactional
    public boolean deleteMerchant(String merchantId) {
        Optional<Merchant> merchantOpt = merchantRepository.findByMerchantId(merchantId);
        
        if (merchantOpt.isEmpty()) {
            return false;
        }
        
        Merchant merchant = merchantOpt.get();
        merchant.setStatus(Merchant.MerchantStatus.SUSPENDED);
        
        merchantRepository.save(merchant);
        
        // Audit log
        auditService.createEvent()
                .eventType("MERCHANT_DELETED")
                .severity(AuditLog.Severity.HIGH)
                .actor("system")
                .action("DELETE")
                .resourceType("MERCHANT")
                .resourceId(merchant.getMerchantId())
                .additionalData("name", merchant.getName())
                .complianceTag("PCI_DSS")
                .log();
        
        log.info("✅ Merchant silindi: {} - {}", merchant.getMerchantId(), merchant.getName());
        
        return true;
    }
    
    /**
     * Yeni API key oluştur
     */
    @Transactional
    public ApiKeyResponse regenerateApiKey(String merchantId) {
        Optional<Merchant> merchantOpt = merchantRepository.findByMerchantId(merchantId);
        
        if (merchantOpt.isEmpty()) {
            return ApiKeyResponse.error(merchantId, "Merchant bulunamadı");
        }
        
        Merchant merchant = merchantOpt.get();
        
        // Eski API key'i audit log'a kaydet
        String oldApiKey = merchant.getApiKey();
        
        // Yeni API key ve secret key oluştur
        String newApiKey = merchantAuthService.generateApiKey(merchantId);
        String newSecretKey = generateSecretKey();
        
        merchant.setApiKey(newApiKey);
        merchant.setSecretKey(newSecretKey);
        
        merchantRepository.save(merchant);
        
        // Audit log
        auditService.createEvent()
                .eventType("API_KEY_REGENERATED")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("system")
                .action("REGENERATE")
                .resourceType("MERCHANT")
                .resourceId(merchant.getMerchantId())
                .additionalData("oldApiKey", oldApiKey != null ? oldApiKey.substring(0, Math.min(8, oldApiKey.length())) + "..." : "null")
                .additionalData("newApiKey", newApiKey.substring(0, Math.min(8, newApiKey.length())) + "...")
                .complianceTag("PCI_DSS")
                .log();
        
        log.info("✅ API key yenilendi: {} - {}", merchant.getMerchantId(), merchant.getName());
        
        return ApiKeyResponse.success(merchantId, newApiKey, newSecretKey);
    }
    
    /**
     * Merchant'ın webhook URL'ini getir
     */
    public String getMerchantWebhookUrl(String merchantId) {
        try {
            Optional<Merchant> merchant = merchantRepository.findByMerchantId(merchantId);
            if (merchant.isPresent()) {
                return merchant.get().getWebhookUrl();
            }
            log.warn("Merchant not found for merchant ID: {}", merchantId);
            return null;
        } catch (Exception e) {
            log.error("Error getting merchant webhook URL for merchant ID: {}", merchantId, e);
            return null;
        }
    }
    
    /**
     * Secret key oluştur
     */
    private String generateSecretKey() {
        return "sk_" + UUID.randomUUID().toString().replace("-", "").substring(0, 24);
    }
    
    /**
     * Merchant sayısını getir
     */
    public long getMerchantCount() {
        return merchantRepository.count();
    }
    
    /**
     * Status'e göre merchant sayısını getir
     */
    public long getMerchantCountByStatus(Merchant.MerchantStatus status) {
        return merchantRepository.findByStatus(status).size();
    }
}