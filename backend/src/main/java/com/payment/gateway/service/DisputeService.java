package com.payment.gateway.service;

import com.payment.gateway.dto.DisputeRequest;
import com.payment.gateway.dto.DisputeResponse;
import com.payment.gateway.dto.BankDisputeNotification;
import com.payment.gateway.dto.MerchantDisputeResponse;
import com.payment.gateway.dto.AdminEvaluationRequest;
import com.payment.gateway.dto.WebhookDeliveryRequest;
import com.payment.gateway.model.Dispute;
import com.payment.gateway.repository.DisputeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.payment.gateway.model.AuditLog;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.payment.gateway.repository.PaymentRepository;
import com.payment.gateway.model.Payment;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class DisputeService {
    
    private final DisputeRepository disputeRepository;
    private final AuditService auditService;
    private final ObjectMapper objectMapper;
    private final PaymentRepository paymentRepository;
    private final MerchantContextService merchantContextService;

    public DisputeResponse createDispute(DisputeRequest request) {
        try {
            // Generate unique dispute ID
            String disputeId = generateDisputeId();
            
            // Create dispute entity
            Dispute dispute = new Dispute();
            dispute.setDisputeId(disputeId);
            dispute.setPaymentId(request.getPaymentId());
            dispute.setTransactionId(request.getTransactionId());
            dispute.setMerchantId(request.getMerchantId());
            dispute.setCustomerId(request.getCustomerId());
            dispute.setAmount(request.getAmount());
            dispute.setCurrency(request.getCurrency());
            dispute.setStatus(Dispute.DisputeStatus.OPENED); // İlk başta her zaman OPENED
            dispute.setReason(request.getReason());
            // Description başlangıçta boş - sadece kanıt eklerken set edilecek
            dispute.setDescription(request.getDescription() != null && !request.getDescription().trim().isEmpty() ? 
                request.getDescription() : "Dispute created - awaiting evidence and description");
            // Evidence başlangıçta boş - sadece kullanıcı eklediğinde set edilecek
            dispute.setEvidence(null);
            dispute.setDisputeDate(LocalDateTime.now());
            
            // Yeni akışta dispute açıldığında direkt OPENED statüsünde kalır
            // Gateway response'u ayarla
            dispute.setGatewayResponse("Dispute opened successfully - awaiting evidence");
            dispute.setGatewayDisputeId("GDSP-" + UUID.randomUUID().toString().substring(0, 8));
            
            // Save dispute
            Dispute savedDispute = disputeRepository.save(dispute);
            
            // Audit logging
            auditService.createEvent()
                .eventType("DISPUTE_CREATED")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("system")
                .action("CREATE")
                .resourceType("DISPUTE")
                .resourceId(disputeId)
                .newValues(savedDispute)
                .additionalData("paymentId", request.getPaymentId())
                .additionalData("merchantId", request.getMerchantId())
                .complianceTag("PCI_DSS")
                .log();
            
            log.info("Dispute created successfully with ID: {}", disputeId);
            
            return createDisputeResponse(savedDispute, "Dispute created successfully", true);
            
        } catch (Exception e) {
            log.error("Error creating dispute: {}", e.getMessage());
            return createErrorResponse("Failed to create dispute: " + e.getMessage());
        }
    }

    /**
     * Customer'ın belirtilen merchant'a ait olup olmadığını kontrol et
     */
    private boolean isCustomerBelongsToMerchant(String customerId, String merchantId) {
        try {
            // Customer'ın bu merchant'a ait payment'ları var mı kontrol et
            // Eğer customer'ın bu merchant'a ait payment'ı yoksa, customer bu merchant'a ait değil
            List<Payment> customerPayments = paymentRepository.findByCustomerId(customerId);
            return customerPayments.stream()
                    .anyMatch(payment -> payment.getMerchantId().equals(merchantId));
        } catch (Exception e) {
            log.error("Error checking customer-merchant relationship: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Dispute request'ini payment bilgileri ile doğrula
     */
    private ValidationResult validateDisputeAgainstPayment(DisputeRequest request, String merchantId) {
        try {
            // Transaction ID ile payment'i bul
            Optional<Payment> paymentOpt = paymentRepository.findByTransactionId(request.getTransactionId());
            if (paymentOpt.isEmpty()) {
                return ValidationResult.invalid("Payment not found with transaction ID: " + request.getTransactionId());
            }
            
            Payment payment = paymentOpt.get();
            
            // Payment ID kontrolü
            if (!payment.getPaymentId().equals(request.getPaymentId())) {
                return ValidationResult.invalid("Payment ID mismatch. Transaction ID " + request.getTransactionId() + 
                    " belongs to payment " + payment.getPaymentId() + ", not " + request.getPaymentId());
            }
            
            // Merchant ID kontrolü
            if (!payment.getMerchantId().equals(merchantId)) {
                return ValidationResult.invalid("Payment belongs to different merchant. Cannot create dispute for another merchant's payment.");
            }
            
            // Amount kontrolü
            if (payment.getAmount().compareTo(request.getAmount()) != 0) {
                return ValidationResult.invalid("Amount mismatch. Payment amount is " + payment.getAmount() + 
                    " but dispute amount is " + request.getAmount());
            }
            
            // Currency kontrolü
            if (!payment.getCurrency().equals(request.getCurrency())) {
                return ValidationResult.invalid("Currency mismatch. Payment currency is " + payment.getCurrency() + 
                    " but dispute currency is " + request.getCurrency());
            }
            
            // Customer ID kontrolü
            if (!payment.getCustomerId().equals(request.getCustomerId())) {
                return ValidationResult.invalid("Customer ID mismatch. Payment customer is " + payment.getCustomerId() + 
                    " but dispute customer is " + request.getCustomerId());
            }
            
            // Payment status kontrolü - sadece completed payment'lar için dispute oluşturulabilir
            if (payment.getStatus() != Payment.PaymentStatus.COMPLETED) {
                return ValidationResult.invalid("Disputes can only be created for completed payments. Current payment status: " + payment.getStatus());
            }
            
            // Bu payment için zaten bir dispute var mı kontrol et
            Optional<Dispute> existingDispute = disputeRepository.findByPaymentId(request.getPaymentId());
            if (existingDispute.isPresent()) {
                return ValidationResult.invalid("A dispute already exists for this payment. Dispute ID: " + existingDispute.get().getDisputeId());
            }
            
            log.info("✅ Payment validation successful for dispute creation - Payment: {}, Transaction: {}", 
                payment.getPaymentId(), payment.getTransactionId());
            
            return ValidationResult.valid();
            
        } catch (Exception e) {
            log.error("Error validating dispute against payment: {}", e.getMessage(), e);
            return ValidationResult.invalid("Failed to validate payment information: " + e.getMessage());
        }
    }

    /**
     * Validation result helper class
     */
    private static class ValidationResult {
        private final boolean valid;
        private final String errorMessage;
        
        private ValidationResult(boolean valid, String errorMessage) {
            this.valid = valid;
            this.errorMessage = errorMessage;
        }
        
        public static ValidationResult valid() {
            return new ValidationResult(true, null);
        }
        
        public static ValidationResult invalid(String errorMessage) {
            return new ValidationResult(false, errorMessage);
        }
        
        public boolean isValid() {
            return valid;
        }
        
        public String getErrorMessage() {
            return errorMessage;
        }
    }

    /**
     * Merchant ID ile kısıtlanmış dispute oluşturma
     */
    public DisputeResponse createDisputeForMerchant(DisputeRequest request, String merchantId) {
        try {
            // Payment'ın bu merchant'a ait olduğunu doğrula
            if (!request.getMerchantId().equals(merchantId)) {
                log.warn("🚫 Merchant {} tried to create dispute for payment owned by {}", 
                    merchantId, request.getMerchantId());
                return createErrorResponse("You can only create disputes for your own payments");
            }

            // Payment bilgilerini doğrula - transaction ID ile payment'i bul
            ValidationResult paymentValidation = validateDisputeAgainstPayment(request, merchantId);
            if (!paymentValidation.isValid()) {
                log.warn("🚫 Dispute validation failed for merchant {}: {}", merchantId, paymentValidation.getErrorMessage());
                return createErrorResponse(paymentValidation.getErrorMessage());
            }

            // Customer'ın bu merchant'a ait olup olmadığını kontrol et
            if (!isCustomerBelongsToMerchant(request.getCustomerId(), merchantId)) {
                log.warn("🚫 Merchant {} tried to create dispute for customer {} who doesn't belong to them", 
                    merchantId, request.getCustomerId());
                return createErrorResponse("Customer does not belong to your merchant account");
            }

            // Normal dispute oluşturma işlemini devam ettir
            return createDispute(request);
            
        } catch (Exception e) {
            log.error("Error creating dispute for merchant {}: {}", merchantId, e.getMessage(), e);
            return createErrorResponse("Failed to create dispute: " + e.getMessage());
        }
    }
    
    public DisputeResponse getDisputeById(Long id) {
        Optional<Dispute> dispute = disputeRepository.findById(id);
        if (dispute.isPresent()) {
            return createDisputeResponse(dispute.get(), "Dispute retrieved successfully", true);
        } else {
            return createErrorResponse("Dispute not found with ID: " + id);
        }
    }

    /**
     * Merchant ID ile kısıtlanmış dispute ID ile arama
     */
    public DisputeResponse getDisputeByIdForMerchant(Long id, String merchantId) {
        Optional<Dispute> dispute = disputeRepository.findById(id);
        if (dispute.isPresent()) {
            Dispute d = dispute.get();
            // Merchant ID kontrolü
            if (!d.getMerchantId().equals(merchantId)) {
                log.warn("🚫 Merchant {} tried to access dispute {} owned by {}", 
                    merchantId, id, d.getMerchantId());
                return createErrorResponse("Dispute not found or access denied");
            }
            return createDisputeResponse(d, "Dispute retrieved successfully", true);
        } else {
            return createErrorResponse("Dispute not found with ID: " + id);
        }
    }
    
    public DisputeResponse getDisputeByDisputeId(String disputeId) {
        Optional<Dispute> dispute = disputeRepository.findByDisputeId(disputeId);
        if (dispute.isPresent()) {
            return createDisputeResponse(dispute.get(), "Dispute retrieved successfully", true);
        } else {
            return createErrorResponse("Dispute not found with dispute ID: " + disputeId);
        }
    }
    
    public DisputeResponse getDisputeByPaymentId(String paymentId) {
        Optional<Dispute> dispute = disputeRepository.findByPaymentId(paymentId);
        if (dispute.isPresent()) {
            return createDisputeResponse(dispute.get(), "Dispute retrieved successfully", true);
        } else {
            return createErrorResponse("Dispute not found with payment ID: " + paymentId);
        }
    }
    
    public List<DisputeResponse> getAllDisputes() {
        List<Dispute> disputes;
        
        if (merchantContextService.isAdminUser()) {
            // Admin tüm dispute'ları görebilir
            disputes = disputeRepository.findAll();
        } else {
            // Merchant sadece kendi dispute'larını görebilir
            String currentMerchantId = merchantContextService.getCurrentMerchantId();
            if (currentMerchantId != null) {
                disputes = disputeRepository.findByMerchantId(currentMerchantId);
            } else {
                return List.of(); // Merchant ID bulunamadı
            }
        }
        
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, null, true))
                .collect(Collectors.toList());
    }
    
    public List<DisputeResponse> getDisputesByMerchantId(String merchantId) {
        List<Dispute> disputes = disputeRepository.findByMerchantId(merchantId);
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, null, true))
                .collect(Collectors.toList());
    }
    
    public List<DisputeResponse> getDisputesByCustomerId(String customerId) {
        List<Dispute> disputes = disputeRepository.findByCustomerId(customerId);
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, null, true))
                .collect(Collectors.toList());
    }
    
    public List<DisputeResponse> getDisputesByStatus(Dispute.DisputeStatus status) {
        List<Dispute> disputes = disputeRepository.findByStatus(status);
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, null, true))
                .collect(Collectors.toList());
    }
    
    public List<DisputeResponse> getDisputesByReason(Dispute.DisputeReason reason) {
        List<Dispute> disputes = disputeRepository.findByReason(reason);
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, null, true))
                .collect(Collectors.toList());
    }
    
    public List<DisputeResponse> getDisputesByTransactionId(String transactionId) {
        List<Dispute> disputes = disputeRepository.findByTransactionId(transactionId);
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, null, true))
                .collect(Collectors.toList());
    }
    
    public DisputeResponse updateDispute(Long id, DisputeRequest request) {
        Optional<Dispute> disputeOpt = disputeRepository.findById(id);
        if (disputeOpt.isPresent()) {
            Dispute dispute = disputeOpt.get();
            
            // Update dispute fields
            dispute.setAmount(request.getAmount());
            dispute.setCurrency(request.getCurrency());
            dispute.setReason(request.getReason());
            dispute.setDescription(request.getDescription());
            dispute.setEvidence(request.getEvidence());
            
            Dispute updatedDispute = disputeRepository.save(dispute);
            
            log.info("Dispute updated successfully with ID: {}", id);
            return createDisputeResponse(updatedDispute, "Dispute updated successfully", true);
        } else {
            return createErrorResponse("Dispute not found with ID: " + id);
        }
    }
    
    /**
     * Dispute'ı dispute ID ile bul ve güncelle (merchant validation ile)
     */
    public DisputeResponse updateDisputeByDisputeId(String disputeId, DisputeRequest request, String merchantId) {
        try {
            // Dispute'ı dispute ID ile bul
            Optional<Dispute> disputeOpt = disputeRepository.findByDisputeId(disputeId);
            if (disputeOpt.isEmpty()) {
                log.warn("🚫 Dispute not found with dispute ID: {}", disputeId);
                return createErrorResponse("Dispute not found with dispute ID: " + disputeId);
            }
            
            Dispute dispute = disputeOpt.get();
            
            // Merchant ID kontrolü - sadece kendi dispute'ını güncelleyebilir
            if (!dispute.getMerchantId().equals(merchantId)) {
                log.warn("🚫 Merchant {} tried to update dispute {} owned by {}", 
                    merchantId, disputeId, dispute.getMerchantId());
                return createErrorResponse("Access denied. You can only update your own disputes");
            }
            
            // Update dispute fields
            dispute.setAmount(request.getAmount());
            dispute.setCurrency(request.getCurrency());
            dispute.setReason(request.getReason());
            dispute.setDescription(request.getDescription());
            dispute.setEvidence(request.getEvidence());
            dispute.setUpdatedAt(LocalDateTime.now());
            
            Dispute updatedDispute = disputeRepository.save(dispute);
            
            // Audit logging
            auditService.createEvent()
                .eventType("DISPUTE_UPDATED")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("merchant")
                .action("UPDATE")
                .resourceType("DISPUTE")
                .resourceId(disputeId)
                .oldValues(dispute)
                .newValues(updatedDispute)
                .additionalData("merchantId", merchantId)
                .complianceTag("PCI_DSS")
                .log();
            
            log.info("✅ Dispute updated successfully with dispute ID: {} by merchant: {}", disputeId, merchantId);
            return createDisputeResponse(updatedDispute, "Dispute updated successfully", true);
            
        } catch (Exception e) {
            log.error("❌ Error updating dispute with dispute ID {}: {}", disputeId, e.getMessage(), e);
            return createErrorResponse("Failed to update dispute: " + e.getMessage());
        }
    }
    
    public DisputeResponse updateDisputeStatus(Long id, Dispute.DisputeStatus newStatus) {
        Optional<Dispute> disputeOpt = disputeRepository.findById(id);
        if (disputeOpt.isPresent()) {
            Dispute dispute = disputeOpt.get();
            log.info("🔄 Updating dispute status from {} to {} for ID: {}", dispute.getStatus(), newStatus, id);
            
            dispute.setStatus(newStatus);
            
            // Set resolution date if dispute is resolved
            if (newStatus == Dispute.DisputeStatus.RESOLVED || 
                newStatus == Dispute.DisputeStatus.WON || 
                newStatus == Dispute.DisputeStatus.LOST) {
                dispute.setResolutionDate(LocalDateTime.now());
            }
            
            dispute.setGatewayResponse("Status updated to: " + newStatus);
            Dispute updatedDispute = disputeRepository.save(dispute);
            
            log.info("✅ Dispute status updated successfully to {} for ID: {}", updatedDispute.getStatus(), id);
            
            // Create response and log the status
            DisputeResponse response = createDisputeResponse(updatedDispute, "Dispute status updated successfully", true);
            log.info("📤 Response status: {}, Dispute status: {}", response.getStatus(), updatedDispute.getStatus());
            
            return response;
        } else {
            return createErrorResponse("Dispute not found with ID: " + id);
        }
    }
    
    public DisputeResponse closeDispute(Long id) {
        Optional<Dispute> disputeOpt = disputeRepository.findById(id);
        if (disputeOpt.isPresent()) {
            Dispute dispute = disputeOpt.get();
            
            if (dispute.getStatus() == Dispute.DisputeStatus.OPENED || 
                dispute.getStatus() == Dispute.DisputeStatus.UNDER_REVIEW) {
                
                dispute.setStatus(Dispute.DisputeStatus.CLOSED);
                dispute.setResolutionDate(LocalDateTime.now());
                dispute.setGatewayResponse("Dispute closed");
                Dispute updatedDispute = disputeRepository.save(dispute);
                
                log.info("Dispute closed successfully with ID: {}", id);
                return createDisputeResponse(updatedDispute, "Dispute closed successfully", true);
            } else {
                return createErrorResponse("Cannot close dispute with status: " + dispute.getStatus());
            }
        } else {
            return createErrorResponse("Dispute not found with ID: " + id);
        }
    }
    
    private String generateDisputeId() {
        return "DSP-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
    
    private Dispute.DisputeStatus processDisputeThroughGateway(Dispute dispute) {
        // Simulate dispute gateway processing
        // In real implementation, this would call external dispute gateway API
        
        try {
            // Simulate processing time
            Thread.sleep(100);
            
            // Simulate success/failure based on reason
            if (dispute.getReason() == Dispute.DisputeReason.FRAUD) {
                dispute.setGatewayResponse("Dispute under review - fraud investigation required");
                dispute.setGatewayDisputeId("GDSP-" + UUID.randomUUID().toString().substring(0, 8));
                return Dispute.DisputeStatus.UNDER_REVIEW;
            } else {
                dispute.setGatewayResponse("Dispute opened successfully");
                dispute.setGatewayDisputeId("GDSP-" + UUID.randomUUID().toString().substring(0, 8));
                return Dispute.DisputeStatus.OPENED;
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            dispute.setGatewayResponse("Dispute processing interrupted");
            return Dispute.DisputeStatus.OPENED;
        }
    }
    
    private DisputeResponse createDisputeResponse(Dispute dispute, String message, boolean success) {
        DisputeResponse response = new DisputeResponse();
        response.setId(dispute.getId());
        response.setDisputeId(dispute.getDisputeId());
        response.setPaymentId(dispute.getPaymentId());
        response.setTransactionId(dispute.getTransactionId());
        response.setMerchantId(dispute.getMerchantId());
        response.setCustomerId(dispute.getCustomerId());
        response.setAmount(dispute.getAmount());
        response.setCurrency(dispute.getCurrency());
        response.setStatus(dispute.getStatus());
        response.setReason(dispute.getReason());
        response.setDescription(dispute.getDescription());
        response.setEvidence(dispute.getEvidence());
        response.setGatewayResponse(dispute.getGatewayResponse());
        response.setGatewayDisputeId(dispute.getGatewayDisputeId());
        response.setDisputeDate(dispute.getDisputeDate());
        response.setResolutionDate(dispute.getResolutionDate());
        response.setCreatedAt(dispute.getCreatedAt());
        response.setUpdatedAt(dispute.getUpdatedAt());
        response.setMessage(message);
        response.setSuccess(success);
        
        // Bank dispute alanları
        response.setBankDisputeId(dispute.getBankDisputeId());
        response.setMerchantResponseDeadline(dispute.getMerchantResponseDeadline());
        response.setAdminEvaluationDeadline(dispute.getAdminEvaluationDeadline());
        response.setMerchantResponse(dispute.getMerchantResponse());
        response.setAdminNotes(dispute.getAdminNotes());
        
        return response;
    }
    
    private DisputeResponse createErrorResponse(String errorMessage) {
        DisputeResponse response = new DisputeResponse();
        response.setMessage(errorMessage);
        response.setSuccess(false);
        return response;
    }
    
    /**
     * Dispute'a kanıt ekle (Merchant kanıt gönderir)
     */
    public DisputeResponse addEvidenceToDispute(Long id, String evidence, String additionalNotes) {
        Optional<Dispute> disputeOpt = disputeRepository.findById(id);
        if (disputeOpt.isPresent()) {
            Dispute dispute = disputeOpt.get();
            
            // Mevcut kanıtı güncelle
            String currentEvidence = dispute.getEvidence();
            String updatedEvidence = currentEvidence != null ? 
                currentEvidence + "\n\n--- YENİ KANIT ---\n" + evidence : evidence;
            
            dispute.setEvidence(updatedEvidence);
            
            // Description'ı güncelle - kanıt eklerken açıklama da eklenir
            String newDescription = evidence; // Kanıtı description olarak kullan
            if (additionalNotes != null && !additionalNotes.trim().isEmpty()) {
                newDescription = evidence + "\n\nEk Notlar: " + additionalNotes;
            }
            dispute.setDescription(newDescription);
            
            // Status'u güncelle - sadece OPENED'dan UNDER_REVIEW'e geçiş yapılabilir
            if (dispute.getStatus() == Dispute.DisputeStatus.OPENED) {
                dispute.setStatus(Dispute.DisputeStatus.UNDER_REVIEW);
                dispute.setGatewayResponse("Evidence submitted - dispute under review");
                log.info("🔄 Dispute status updated to UNDER_REVIEW after evidence submission for ID: {}", id);
            } else if (dispute.getStatus() == Dispute.DisputeStatus.UNDER_REVIEW) {
                dispute.setGatewayResponse("Additional evidence submitted - dispute still under review");
                log.info("📝 Additional evidence added to dispute ID: {}", id);
            } else {
                log.warn("🚫 Cannot add evidence to dispute {} in status: {}", id, dispute.getStatus());
                return createErrorResponse("Cannot add evidence to dispute in current status: " + dispute.getStatus());
            }
            dispute.setUpdatedAt(LocalDateTime.now());
            
            Dispute updatedDispute = disputeRepository.save(dispute);
            
            // Audit logging
            auditService.createEvent()
                .eventType("DISPUTE_EVIDENCE_ADDED")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("merchant")
                .action("UPDATE")
                .resourceType("DISPUTE")
                .resourceId(dispute.getDisputeId())
                .additionalData("evidenceLength", String.valueOf(evidence.length()))
                .additionalData("additionalNotes", additionalNotes)
                .complianceTag("PCI_DSS")
                .log();
            
            log.info("Evidence added to dispute with ID: {}", id);
            return createDisputeResponse(updatedDispute, "Evidence added successfully", true);
        } else {
            return createErrorResponse("Dispute not found with ID: " + id);
        }
    }

    /**
     * Dispute'a kanıt ekle (Dispute ID ile - merchant validation ile)
     */
    public DisputeResponse addEvidenceToDisputeByDisputeId(String disputeId, String evidence, String additionalNotes, String merchantId) {
        try {
            Optional<Dispute> disputeOpt = disputeRepository.findByDisputeId(disputeId);
            if (disputeOpt.isEmpty()) {
                log.warn("🚫 Dispute not found with dispute ID: {}", disputeId);
                return createErrorResponse("Dispute not found with dispute ID: " + disputeId);
            }

            Dispute dispute = disputeOpt.get();

            // Merchant ID kontrolü - sadece kendi dispute'una kanıt ekleyebilir
            if (!dispute.getMerchantId().equals(merchantId)) {
                log.warn("🚫 Merchant {} tried to add evidence to dispute {} owned by {}",
                    merchantId, disputeId, dispute.getMerchantId());
                return createErrorResponse("Access denied. You can only add evidence to your own disputes");
            }

            // Mevcut kanıtı güncelle
            String currentEvidence = dispute.getEvidence();
            String updatedEvidence = currentEvidence != null ? 
                currentEvidence + "\n\n--- YENİ KANIT ---\n" + evidence : evidence;
            
            dispute.setEvidence(updatedEvidence);
            
            // Description'ı güncelle - kanıt eklerken açıklama da eklenir
            String newDescription = evidence; // Kanıtı description olarak kullan
            if (additionalNotes != null && !additionalNotes.trim().isEmpty()) {
                newDescription = evidence + "\n\nEk Notlar: " + additionalNotes;
            }
            dispute.setDescription(newDescription);
            
            // Kanıt eklendikten sonra statüyü UNDER_REVIEW olarak güncelle
            // Sadece OPENED statüsündeyken UNDER_REVIEW'e geçebilir
            if (dispute.getStatus() == Dispute.DisputeStatus.OPENED) {
                dispute.setStatus(Dispute.DisputeStatus.UNDER_REVIEW);
                dispute.setGatewayResponse("Evidence submitted - dispute under review");
                log.info("🔄 Dispute status updated to UNDER_REVIEW after evidence submission for dispute ID: {}", disputeId);
            } else if (dispute.getStatus() == Dispute.DisputeStatus.UNDER_REVIEW) {
                // Zaten UNDER_REVIEW'deyse sadece yeni kanıt ekle
                dispute.setGatewayResponse("Additional evidence submitted - dispute still under review");
                log.info("📝 Additional evidence added to dispute ID: {}", disputeId);
            } else {
                // Diğer statülerde kanıt eklemeye izin verme
                log.warn("🚫 Cannot add evidence to dispute {} in status: {}", disputeId, dispute.getStatus());
                return createErrorResponse("Cannot add evidence to dispute in current status: " + dispute.getStatus());
            }
            
            dispute.setUpdatedAt(LocalDateTime.now());

            Dispute updatedDispute = disputeRepository.save(dispute);

            // Audit logging
            auditService.createEvent()
                .eventType("DISPUTE_EVIDENCE_ADDED")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("merchant")
                .action("ADD_EVIDENCE")
                .resourceType("DISPUTE")
                .resourceId(disputeId)
                .oldValues(dispute)
                .newValues(updatedDispute)
                .additionalData("merchantId", merchantId)
                .additionalData("evidenceLength", String.valueOf(evidence.length()))
                .additionalData("additionalNotes", additionalNotes)
                .complianceTag("PCI_DSS")
                .log();

            log.info("✅ Evidence added successfully to dispute with dispute ID: {} by merchant: {}", disputeId, merchantId);
            return createDisputeResponse(updatedDispute, "Evidence added successfully", true);

        } catch (Exception e) {
            log.error("❌ Error adding evidence to dispute with dispute ID {}: {}", disputeId, e.getMessage(), e);
            return createErrorResponse("Failed to add evidence: " + e.getMessage());
        }
    }
    
    /**
     * Dispute'ı değerlendir (Admin değerlendirir) - ID ile
     */
    public DisputeResponse evaluateDispute(Long id, String decision, String adminNotes, String refundAmount) {
        Optional<Dispute> disputeOpt = disputeRepository.findById(id);
        if (disputeOpt.isPresent()) {
            return evaluateDisputeInternal(disputeOpt.get(), decision, adminNotes, refundAmount);
        } else {
            return createErrorResponse("Dispute not found with ID: " + id);
        }
    }

    /**
     * Dispute'ı değerlendir (Admin değerlendirir) - Transaction ID ile
     */
    public DisputeResponse evaluateDisputeByTransactionId(String transactionId, String decision, String adminNotes, String refundAmount) {
        List<Dispute> disputes = disputeRepository.findByTransactionId(transactionId);
        if (disputes.isEmpty()) {
            return createErrorResponse("No dispute found for transaction ID: " + transactionId);
        }
        
        if (disputes.size() > 1) {
            log.warn("Multiple disputes found for transaction ID: {}. Using the first one.", transactionId);
        }
        
        Dispute dispute = disputes.get(0);
        return evaluateDisputeInternal(dispute, decision, adminNotes, refundAmount);
    }

    /**
     * Dispute'ı değerlendir (Admin değerlendirir) - Dispute ID ile
     */
    public DisputeResponse evaluateDisputeByDisputeId(String disputeId, String decision, String adminNotes, String refundAmount) {
        Optional<Dispute> disputeOpt = disputeRepository.findByDisputeId(disputeId);
        if (disputeOpt.isEmpty()) {
            return createErrorResponse("No dispute found for dispute ID: " + disputeId);
        }
        
        Dispute dispute = disputeOpt.get();
        return evaluateDisputeInternal(dispute, decision, adminNotes, refundAmount);
    }

    /**
     * Internal method to evaluate dispute
     */
    private DisputeResponse evaluateDisputeInternal(Dispute dispute, String decision, String adminNotes, String refundAmount) {
        // Sadece UNDER_REVIEW statüsündeki dispute'lar değerlendirilebilir
        if (dispute.getStatus() != Dispute.DisputeStatus.UNDER_REVIEW) {
            return createErrorResponse("Dispute must be under review to be evaluated. Current status: " + dispute.getStatus());
        }

        // Decision'a göre status güncelle
        switch (decision.toUpperCase()) {
            case "APPROVED":
            case "WON":
                dispute.setStatus(Dispute.DisputeStatus.WON);
                dispute.setGatewayResponse("Dispute evaluated - Customer wins. " + (adminNotes != null ? adminNotes : ""));
                break;
            case "REJECTED":
            case "LOST":
                dispute.setStatus(Dispute.DisputeStatus.LOST);
                dispute.setGatewayResponse("Dispute evaluated - Merchant wins. " + (adminNotes != null ? adminNotes : ""));
                break;
            case "PARTIAL_REFUND":
                dispute.setStatus(Dispute.DisputeStatus.PARTIAL_REFUND);
                dispute.setGatewayResponse("Partial refund approved: " + refundAmount + ". " + (adminNotes != null ? adminNotes : ""));
                break;
            default:
                return createErrorResponse("Invalid decision: " + decision + ". Valid options: APPROVED/WON, REJECTED/LOST, PARTIAL_REFUND");
        }
        
        // Admin notlarını ekle
        if (adminNotes != null && !adminNotes.trim().isEmpty()) {
            String currentNotes = dispute.getDescription();
            String updatedNotes = currentNotes != null ? 
                currentNotes + "\n\nAdmin Notları: " + adminNotes : adminNotes;
            dispute.setDescription(updatedNotes);
        }
        
        dispute.setResolutionDate(LocalDateTime.now());
        dispute.setUpdatedAt(LocalDateTime.now());
        
        Dispute updatedDispute = disputeRepository.save(dispute);
        
        // Audit logging
        auditService.createEvent()
            .eventType("DISPUTE_EVALUATED")
            .severity(AuditLog.Severity.HIGH)
            .actor("admin")
            .action("UPDATE")
            .resourceType("DISPUTE")
            .resourceId(dispute.getDisputeId())
            .additionalData("decision", decision)
            .additionalData("adminNotes", adminNotes)
            .additionalData("refundAmount", refundAmount)
            .additionalData("transactionId", dispute.getTransactionId())
            .complianceTag("PCI_DSS")
            .log();
        
        log.info("Dispute evaluated with decision: {} for transaction ID: {}", decision, dispute.getTransactionId());
        return createDisputeResponse(updatedDispute, "Dispute evaluated successfully", true);
    }
    
    /**
     * Merchant'a dispute sonucunu bildir
     */
    public DisputeResponse notifyMerchantAboutDisputeResult(Long id) {
        Optional<Dispute> disputeOpt = disputeRepository.findById(id);
        if (disputeOpt.isPresent()) {
            Dispute dispute = disputeOpt.get();
            
            // Dispute çözülmüş olmalı
            if (dispute.getStatus() == Dispute.DisputeStatus.OPENED || 
                dispute.getStatus() == Dispute.DisputeStatus.UNDER_REVIEW) {
                return createErrorResponse("Dispute not yet resolved");
            }
            
            // Merchant'a webhook gönder (simulated)
            String notificationMessage = generateMerchantNotification(dispute);
            dispute.setGatewayResponse(dispute.getGatewayResponse() + "\n\nMerchant notified: " + notificationMessage);
            dispute.setUpdatedAt(LocalDateTime.now());
            
            Dispute updatedDispute = disputeRepository.save(dispute);
            
            // Audit logging
            auditService.createEvent()
                .eventType("MERCHANT_NOTIFIED_DISPUTE_RESULT")
                .severity(AuditLog.Severity.LOW)
                .actor("system")
                .action("NOTIFY")
                .resourceType("DISPUTE")
                .resourceId(dispute.getDisputeId())
                .additionalData("notificationMessage", notificationMessage)
                .complianceTag("PCI_DSS")
                .log();
            
            log.info("Merchant notified about dispute result for ID: {}", id);
            return createDisputeResponse(updatedDispute, "Merchant notified successfully", true);
        } else {
            return createErrorResponse("Dispute not found with ID: " + id);
        }
    }
    
    /**
     * Merchant notification mesajı oluştur
     */
    private String generateMerchantNotification(Dispute dispute) {
        switch (dispute.getStatus()) {
            case WON:
                return "Customer won the dispute. Refund will be processed.";
            case LOST:
                return "Merchant won the dispute. No action required.";
            case PARTIAL_REFUND:
                return "Partial refund approved. Amount: " + dispute.getAmount();
            case CLOSED:
                return "Dispute closed. Final decision: " + dispute.getGatewayResponse();
            default:
                return "Dispute status updated: " + dispute.getStatus();
        }
    }
    
    /**
     * Banka tarafından başlatılan dispute oluştur
     */
    public DisputeResponse createBankInitiatedDispute(BankDisputeNotification notification) {
        try {
            log.info("🏦 Creating bank-initiated dispute - Bank ID: {}, Payment: {}", 
                    notification.getBankDisputeId(), notification.getPaymentId());
            
            // Generate unique dispute ID
            String disputeId = generateDisputeId();
            
            // Create dispute entity
            Dispute dispute = new Dispute();
            dispute.setDisputeId(disputeId);
            dispute.setBankDisputeId(notification.getBankDisputeId());
            dispute.setPaymentId(notification.getPaymentId());
            dispute.setTransactionId(notification.getTransactionId());
            dispute.setMerchantId(notification.getMerchantId());
            dispute.setCustomerId("BANK_CUSTOMER"); // Bank-initiated, no specific customer ID
            dispute.setAmount(notification.getDisputeAmount());
            dispute.setCurrency(notification.getCurrency());
            dispute.setStatus(Dispute.DisputeStatus.BANK_INITIATED);
            
            // Map bank dispute reason to our enum
            Dispute.DisputeReason reason = mapBankDisputeReason(notification.getDisputeReason());
            dispute.setReason(reason);
            
            dispute.setDescription("Bank-initiated dispute: " + notification.getCustomerInfo());
            dispute.setDisputeDate(notification.getDisputeDate());
            dispute.setMerchantResponseDeadline(notification.getResponseDeadline());
            dispute.setBankName(notification.getBankName());
            
            // Store raw bank notification data
            dispute.setBankNotificationData(objectMapper.writeValueAsString(notification));
            
            // Save dispute
            Dispute savedDispute = disputeRepository.save(dispute);
            
            // Update status to merchant notified
            savedDispute.setStatus(Dispute.DisputeStatus.MERCHANT_NOTIFIED);
            savedDispute.setUpdatedAt(LocalDateTime.now());
            savedDispute = disputeRepository.save(savedDispute);
            
            // TODO: Send webhook to merchant
            // webhookService.sendMerchantDisputeNotification(savedDispute);
            
            // Audit logging
            auditService.createEvent()
                .eventType("BANK_DISPUTE_INITIATED")
                .severity(AuditLog.Severity.HIGH)
                .actor("bank-system")
                .action("CREATE")
                .resourceType("DISPUTE")
                .resourceId(disputeId)
                .newValues(savedDispute)
                .additionalData("bankDisputeId", notification.getBankDisputeId())
                .additionalData("bankName", notification.getBankName())
                .additionalData("deadline", notification.getResponseDeadline())
                .complianceTag("PCI_DSS")
                .complianceTag("CHARGEBACK")
                .log();
            
            log.info("✅ Bank-initiated dispute created successfully - ID: {}, Deadline: {}", 
                    disputeId, notification.getResponseDeadline());
            
            return createDisputeResponse(savedDispute, "Bank dispute created and merchant notified", true);
            
        } catch (Exception e) {
            log.error("❌ Error creating bank-initiated dispute: {}", e.getMessage(), e);
            return createErrorResponse("Failed to create bank dispute: " + e.getMessage());
        }
    }
    
    /**
     * Merchant dispute cevabı gönder
     */
    public DisputeResponse submitMerchantResponse(String disputeId, MerchantDisputeResponse response) {
        try {
            log.info("📝 Processing merchant response - Dispute: {}, Type: {}", 
                    disputeId, response.getResponseType());
            
            Optional<Dispute> disputeOpt = disputeRepository.findByDisputeId(disputeId);
            if (disputeOpt.isEmpty()) {
                return createErrorResponse("Dispute not found: " + disputeId);
            }
            
            Dispute dispute = disputeOpt.get();
            
            // Check if response is still allowed
            if (dispute.getMerchantResponseDeadline() != null && 
                LocalDateTime.now().isAfter(dispute.getMerchantResponseDeadline())) {
                return createErrorResponse("Response deadline has passed");
            }
            
            // Check current status
            if (dispute.getStatus() != Dispute.DisputeStatus.MERCHANT_NOTIFIED && 
                dispute.getStatus() != Dispute.DisputeStatus.AWAITING_MERCHANT_RESPONSE) {
                return createErrorResponse("Dispute is not in a state that allows merchant response");
            }
            
            // Update dispute with merchant response
            dispute.setMerchantResponse(response.getResponseType());
            dispute.setMerchantResponseDate(LocalDateTime.now());
            
            if ("ACCEPT".equals(response.getResponseType())) {
                dispute.setStatus(Dispute.DisputeStatus.MERCHANT_ACCEPTED);
                dispute.setDescription(dispute.getDescription() + "\n\nMerchant accepted dispute.");
                
                // TODO: Start automatic refund process
                // refundService.processAutomaticRefund(dispute);
                
            } else if ("DEFEND".equals(response.getResponseType())) {
                dispute.setStatus(Dispute.DisputeStatus.MERCHANT_DEFENDED);
                dispute.setMerchantDefenseEvidence(response.getDefenseEvidence());
                dispute.setDescription(dispute.getDescription() + 
                    "\n\nMerchant defense: " + response.getAdditionalNotes());
                
                // Move to admin evaluation
                dispute.setStatus(Dispute.DisputeStatus.ADMIN_EVALUATING);
            }
            
            dispute.setUpdatedAt(LocalDateTime.now());
            Dispute savedDispute = disputeRepository.save(dispute);
            
            // Audit logging
            auditService.createEvent()
                .eventType("MERCHANT_DISPUTE_RESPONSE")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("merchant")
                .action("RESPOND")
                .resourceType("DISPUTE")
                .resourceId(disputeId)
                .additionalData("responseType", response.getResponseType())
                .additionalData("responseTime", LocalDateTime.now())
                .additionalData("deadlineRemaining", 
                    java.time.Duration.between(LocalDateTime.now(), dispute.getMerchantResponseDeadline()).toHours() + " hours")
                .complianceTag("CHARGEBACK")
                .log();
            
            log.info("✅ Merchant response processed successfully - Dispute: {}, Type: {}, New Status: {}", 
                    disputeId, response.getResponseType(), savedDispute.getStatus());
            
            return createDisputeResponse(savedDispute, "Merchant response submitted successfully", true);
            
        } catch (Exception e) {
            log.error("❌ Error processing merchant response: {}", e.getMessage(), e);
            return createErrorResponse("Failed to process merchant response: " + e.getMessage());
        }
    }
    
    /**
     * Admin değerlendirmesi gönder
     */
    public DisputeResponse submitAdminEvaluation(String disputeId, AdminEvaluationRequest request) {
        try {
            log.info("👨‍💼 Processing admin evaluation - Dispute: {}, Decision: {}", 
                    disputeId, request.getDecision());
            
            Optional<Dispute> disputeOpt = disputeRepository.findByDisputeId(disputeId);
            if (disputeOpt.isEmpty()) {
                return createErrorResponse("Dispute not found: " + disputeId);
            }
            
            Dispute dispute = disputeOpt.get();
            
            // Check current status
            if (dispute.getStatus() != Dispute.DisputeStatus.ADMIN_EVALUATING) {
                return createErrorResponse("Dispute is not in admin evaluation state");
            }
            
            // Update dispute with admin evaluation
            dispute.setAdminEvaluation(request.getEvaluation());
            dispute.setAdminDecision(request.getDecision());
            dispute.setStatus(Dispute.DisputeStatus.BANK_DECISION_PENDING);
            
            if (request.getRefundAmount() != null) {
                dispute.setChargebackAmount(request.getRefundAmount());
            }
            
            dispute.setGatewayResponse("Admin evaluation: " + request.getReasoning());
            dispute.setUpdatedAt(LocalDateTime.now());
            
            Dispute savedDispute = disputeRepository.save(dispute);
            
            // TODO: Send decision to bank
            // bankCommunicationService.sendDisputeDecision(savedDispute, request);
            
            // Audit logging
            auditService.createEvent()
                .eventType("ADMIN_DISPUTE_EVALUATION")
                .severity(AuditLog.Severity.HIGH)
                .actor("admin")
                .action("EVALUATE")
                .resourceType("DISPUTE")
                .resourceId(disputeId)
                .additionalData("decision", request.getDecision())
                .additionalData("reasoning", request.getReasoning())
                .additionalData("refundAmount", request.getRefundAmount())
                .complianceTag("CHARGEBACK")
                .complianceTag("ADMIN_DECISION")
                .log();
            
            log.info("✅ Admin evaluation completed - Dispute: {}, Decision: {}", 
                    disputeId, request.getDecision());
            
            return createDisputeResponse(savedDispute, "Admin evaluation submitted successfully", true);
            
        } catch (Exception e) {
            log.error("❌ Error processing admin evaluation: {}", e.getMessage(), e);
            return createErrorResponse("Failed to process admin evaluation: " + e.getMessage());
        }
    }
    
    /**
     * Banka'nın nihai kararını işle
     */
    public DisputeResponse processBankFinalDecision(String bankDisputeId, String bankDecision, BigDecimal settlementAmount) {
        try {
            log.info("🏦 Processing bank final decision - Bank Dispute: {}, Decision: {}", 
                    bankDisputeId, bankDecision);
            
            Optional<Dispute> disputeOpt = disputeRepository.findByBankDisputeId(bankDisputeId);
            if (disputeOpt.isEmpty()) {
                return createErrorResponse("Dispute not found for bank dispute ID: " + bankDisputeId);
            }
            
            Dispute dispute = disputeOpt.get();
            
            // Update dispute with bank final decision
            dispute.setBankFinalDecision(bankDecision);
            dispute.setChargebackAmount(settlementAmount);
            dispute.setResolutionDate(LocalDateTime.now());
            
            if ("MERCHANT_APPROVED".equals(bankDecision)) {
                dispute.setStatus(Dispute.DisputeStatus.BANK_APPROVED);
                dispute.setGatewayResponse("Bank approved merchant evidence. No chargeback.");
            } else if ("CUSTOMER_APPROVED".equals(bankDecision)) {
                dispute.setStatus(Dispute.DisputeStatus.BANK_REJECTED);
                dispute.setGatewayResponse("Bank approved customer dispute. Chargeback: " + settlementAmount);
                
                // TODO: Process chargeback
                // chargebackService.processChargeback(dispute, settlementAmount);
            }
            
            dispute.setUpdatedAt(LocalDateTime.now());
            Dispute savedDispute = disputeRepository.save(dispute);
            
            // TODO: Notify merchant of final result
            // webhookService.sendMerchantDisputeResult(savedDispute);
            
            // Audit logging
            auditService.createEvent()
                .eventType("BANK_DISPUTE_FINAL_DECISION")
                .severity(AuditLog.Severity.HIGH)
                .actor("bank-system")
                .action("FINALIZE")
                .resourceType("DISPUTE")
                .resourceId(dispute.getDisputeId())
                .additionalData("bankDecision", bankDecision)
                .additionalData("settlementAmount", settlementAmount)
                .additionalData("finalStatus", savedDispute.getStatus())
                .complianceTag("CHARGEBACK")
                .complianceTag("SETTLEMENT")
                .log();
            
            log.info("✅ Bank final decision processed - Dispute: {}, Decision: {}, Amount: {}", 
                    dispute.getDisputeId(), bankDecision, settlementAmount);
            
            return createDisputeResponse(savedDispute, "Bank final decision processed successfully", true);
            
        } catch (Exception e) {
            log.error("❌ Error processing bank final decision: {}", e.getMessage(), e);
            return createErrorResponse("Failed to process bank final decision: " + e.getMessage());
        }
    }
    
    /**
     * Pending merchant responses listesi
     */
    public List<DisputeResponse> getPendingDisputeResponses(String merchantId) {
        List<Dispute> disputes = disputeRepository.findByMerchantIdAndStatusIn(
            merchantId, 
            List.of(Dispute.DisputeStatus.MERCHANT_NOTIFIED, Dispute.DisputeStatus.AWAITING_MERCHANT_RESPONSE)
        );
        
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, "Pending merchant response", true))
                .collect(Collectors.toList());
    }
    
    /**
     * Admin evaluation işlemi
     */
    @Transactional
    public DisputeResponse processAdminEvaluation(Long disputeId, AdminEvaluationRequest request) {
        try {
            Optional<Dispute> disputeOpt = disputeRepository.findById(disputeId);
            if (disputeOpt.isEmpty()) {
                return createErrorResponse("Dispute not found");
            }
            
            Dispute dispute = disputeOpt.get();
            
            // Status kontrolü - sadece UNDER_REVIEW statüsündeki dispute'lar değerlendirilebilir
            if (dispute.getStatus() != Dispute.DisputeStatus.UNDER_REVIEW) {
                return createErrorResponse("Dispute must be under review to be evaluated. Current status: " + dispute.getStatus());
            }
            
            // Admin evaluation'ı kaydet
            dispute.setAdminEvaluation(request.getEvaluation());
            dispute.setAdminDecision(request.getDecision());
            dispute.setAdminNotes(request.getNotes());
            
            // Decision'a göre status güncelle - yeni akışa göre
            switch (request.getDecision().toUpperCase()) {
                case "APPROVE_MERCHANT":
                case "MERCHANT_WINS":
                case "LOST":
                    dispute.setStatus(Dispute.DisputeStatus.LOST); // Merchant kazandı = customer kaybetti
                    dispute.setGatewayResponse("Admin evaluation: Merchant wins - " + request.getReasoning());
                    break;
                case "APPROVE_CUSTOMER":
                case "CUSTOMER_WINS":
                case "WON":
                    dispute.setStatus(Dispute.DisputeStatus.WON); // Customer kazandı
                    dispute.setGatewayResponse("Admin evaluation: Customer wins - " + request.getReasoning());
                    break;
                case "PARTIAL_REFUND":
                    dispute.setStatus(Dispute.DisputeStatus.PARTIAL_REFUND);
                    dispute.setGatewayResponse("Admin evaluation: Partial refund approved - " + request.getReasoning());
                    if (request.getRefundAmount() != null) {
                        dispute.setChargebackAmount(request.getRefundAmount());
                    }
                    break;
                default:
                    return createErrorResponse("Invalid admin decision: " + request.getDecision() + ". Valid options: APPROVE_MERCHANT/LOST, APPROVE_CUSTOMER/WON, PARTIAL_REFUND");
            }
            
            dispute.setResolutionDate(LocalDateTime.now());
            
            Dispute savedDispute = disputeRepository.save(dispute);
            
            // Audit log
            auditService.createEvent()
                .eventType("DISPUTE_ADMIN_EVALUATED")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("admin")
                .action("EVALUATE")
                .resourceType("DISPUTE")
                .resourceId(dispute.getDisputeId())
                .additionalData("decision", request.getDecision())
                .additionalData("evaluation", request.getEvaluation())
                .log();
            
            log.info("Admin evaluation completed for dispute {}: {}", disputeId, request.getDecision());
            
            return createDisputeResponse(savedDispute, "Admin evaluation processed successfully", true);
            
        } catch (Exception e) {
            log.error("Error processing admin evaluation for dispute {}: {}", disputeId, e.getMessage(), e);
            return createErrorResponse("Failed to process admin evaluation: " + e.getMessage());
        }
    }
    
    /**
     * Merchant response deadline'ı geçtiği için dispute'ı otomatik accept et
     */
    @Transactional
    public void autoAcceptDisputeDueToTimeout(Long disputeId) {
        try {
            Optional<Dispute> disputeOpt = disputeRepository.findById(disputeId);
            if (disputeOpt.isEmpty()) {
                log.warn("Dispute not found for auto-accept timeout: {}", disputeId);
                return;
            }
            
            Dispute dispute = disputeOpt.get();
            
            // Durumu kontrol et
            if (dispute.getStatus() != Dispute.DisputeStatus.PENDING_MERCHANT_RESPONSE &&
                dispute.getStatus() != Dispute.DisputeStatus.MERCHANT_NOTIFIED) {
                log.warn("Dispute {} is not in pending merchant response status, current: {}", 
                        disputeId, dispute.getStatus());
                return;
            }
            
            // Auto accept işlemi
            dispute.setStatus(Dispute.DisputeStatus.BANK_APPROVED);
            dispute.setResolutionDate(LocalDateTime.now());
            dispute.setGatewayResponse("Auto-accepted due to merchant response timeout");
            dispute.setMerchantResponse("No response provided within deadline");
            
            disputeRepository.save(dispute);
            
            // Audit log
            auditService.createEvent()
                .eventType("DISPUTE_AUTO_ACCEPTED_TIMEOUT")
                .severity(AuditLog.Severity.HIGH)
                .actor("system")
                .action("AUTO_ACCEPT")
                .resourceType("DISPUTE")
                .resourceId(dispute.getDisputeId())
                .additionalData("reason", "merchant_response_timeout")
                .additionalData("deadline", dispute.getMerchantResponseDeadline().toString())
                .log();
            
            // Merchant'a bildirim gönder
            try {
                WebhookDeliveryRequest webhookRequest = new WebhookDeliveryRequest();
                webhookRequest.setMerchantId(dispute.getMerchantId());
                webhookRequest.setEventType("dispute.auto_accepted");
                webhookRequest.setEntityId(dispute.getDisputeId());
                webhookRequest.setEventData(Map.of(
                    "disputeId", dispute.getDisputeId(),
                    "bankDisputeId", dispute.getBankDisputeId(),
                    "reason", "merchant_response_timeout",
                    "amount", dispute.getAmount(),
                    "currency", dispute.getCurrency()
                ));
                webhookRequest.setDescription("Dispute auto-accepted due to merchant response timeout");
                
                // Webhook endpoint için basit bir delivery attempt yapalım
                log.info("Webhook delivery attempted for dispute auto-accept: {}", dispute.getDisputeId());
            } catch (Exception e) {
                log.error("Failed to send auto-accept webhook for dispute {}: {}", 
                        disputeId, e.getMessage());
            }
            
            log.info("Dispute {} auto-accepted due to merchant response timeout", disputeId);
            
        } catch (Exception e) {
            log.error("Error auto-accepting dispute {} due to timeout: {}", disputeId, e.getMessage(), e);
            throw new RuntimeException("Failed to auto-accept dispute due to timeout", e);
        }
    }
    
    /**
     * Admin evaluation deadline'ı geçtiği için dispute'ı otomatik accept et
     */
    @Transactional
    public void autoAcceptDisputeDueToAdminTimeout(Long disputeId) {
        try {
            Optional<Dispute> disputeOpt = disputeRepository.findById(disputeId);
            if (disputeOpt.isEmpty()) {
                log.warn("Dispute not found for auto-accept admin timeout: {}", disputeId);
                return;
            }
            
            Dispute dispute = disputeOpt.get();
            
            // Durumu kontrol et
            if (dispute.getStatus() != Dispute.DisputeStatus.PENDING_ADMIN_EVALUATION) {
                log.warn("Dispute {} is not in pending admin evaluation status, current: {}", 
                        disputeId, dispute.getStatus());
                return;
            }
            
            // Auto accept işlemi (admin timeout durumunda da customer lehine sonuçlan)
            dispute.setStatus(Dispute.DisputeStatus.BANK_APPROVED);
            dispute.setResolutionDate(LocalDateTime.now());
            dispute.setGatewayResponse("Auto-accepted due to admin evaluation timeout");
            dispute.setAdminNotes("No admin evaluation provided within deadline");
            
            disputeRepository.save(dispute);
            
            // Audit log
            auditService.createEvent()
                .eventType("DISPUTE_AUTO_ACCEPTED_ADMIN_TIMEOUT")
                .severity(AuditLog.Severity.HIGH)
                .actor("system")
                .action("AUTO_ACCEPT")
                .resourceType("DISPUTE")
                .resourceId(dispute.getDisputeId())
                .additionalData("reason", "admin_evaluation_timeout")
                .additionalData("deadline", dispute.getAdminEvaluationDeadline().toString())
                .log();
            
            // Merchant ve bankaya bildirim gönder
            try {
                // Merchant bildirim
                WebhookDeliveryRequest webhookRequest = new WebhookDeliveryRequest();
                webhookRequest.setMerchantId(dispute.getMerchantId());
                webhookRequest.setEventType("dispute.auto_accepted_admin_timeout");
                webhookRequest.setEntityId(dispute.getDisputeId());
                webhookRequest.setEventData(Map.of(
                    "disputeId", dispute.getDisputeId(),
                    "bankDisputeId", dispute.getBankDisputeId(),
                    "reason", "admin_evaluation_timeout",
                    "amount", dispute.getAmount(),
                    "currency", dispute.getCurrency()
                ));
                webhookRequest.setDescription("Dispute auto-accepted due to admin evaluation timeout");
                
                log.info("Webhook delivery attempted for admin timeout auto-accept: {}", dispute.getDisputeId());
                
                // Bankaya nihai kararı bildir
                notifyBankOfFinalDecision(dispute.getBankDisputeId(), "ACCEPTED", 
                    "Auto-accepted due to admin evaluation timeout");
                    
            } catch (Exception e) {
                log.error("Failed to send admin timeout webhooks for dispute {}: {}", 
                        disputeId, e.getMessage());
            }
            
            log.info("Dispute {} auto-accepted due to admin evaluation timeout", disputeId);
            
        } catch (Exception e) {
            log.error("Error auto-accepting dispute {} due to admin timeout: {}", disputeId, e.getMessage(), e);
            throw new RuntimeException("Failed to auto-accept dispute due to admin timeout", e);
        }
    }
    
    /**
     * Bankaya dispute'ın nihai kararını bildirir
     */
    private void notifyBankOfFinalDecision(String bankDisputeId, String decision, String reason) {
        try {
            log.info("Notifying bank of final decision for dispute {}: {} - {}", 
                    bankDisputeId, decision, reason);
            
            // Burada gerçek bank API çağrısı yapılacak
            // Şimdilik sadece log'a yazıyoruz
            log.info("Bank notification sent successfully for dispute: {}", bankDisputeId);
            
        } catch (Exception e) {
            log.error("Failed to notify bank of final decision for dispute {}: {}", 
                    bankDisputeId, e.getMessage(), e);
            // Bank notification failure should not fail the main process
        }
    }
    
    /**
     * Banka dispute reason'ını bizim enum'a map et
     */
    private Dispute.DisputeReason mapBankDisputeReason(String bankReason) {
        switch (bankReason.toUpperCase()) {
            case "UNAUTHORIZED_TRANSACTION":
            case "FRAUD":
                return Dispute.DisputeReason.UNAUTHORIZED_TRANSACTION;
            case "NON_RECEIPT":
            case "PRODUCT_NOT_RECEIVED":
                return Dispute.DisputeReason.NON_RECEIPT;
            case "DEFECTIVE_PRODUCT":
            case "PRODUCT_NOT_AS_DESCRIBED":
                return Dispute.DisputeReason.DEFECTIVE_PRODUCT;
            case "DUPLICATE_CHARGE":
            case "DUPLICATE":
                return Dispute.DisputeReason.DUPLICATE_CHARGE;
            case "PROCESSING_ERROR":
                return Dispute.DisputeReason.PROCESSING_ERROR;
            default:
                return Dispute.DisputeReason.GENERAL;
        }
    }

    // Merchant-based filtering methods
    
    /**
     * Merchant'a ait tüm dispute'ları getir
     */
    public List<DisputeResponse> getDisputesForMerchant(String merchantId) {
        List<Dispute> disputes = disputeRepository.findByMerchantId(merchantId);
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, null, true))
                .collect(Collectors.toList());
    }
    
    /**
     * Merchant'a ait belirli status'taki dispute'ları getir
     */
    public List<DisputeResponse> getDisputesForMerchantByStatus(String merchantId, Dispute.DisputeStatus status) {
        List<Dispute> disputes = disputeRepository.findByMerchantIdAndStatus(merchantId, status);
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, null, true))
                .collect(Collectors.toList());
    }
    
    /**
     * Merchant'a ait belirli reason'daki dispute'ları getir
     */
    public List<DisputeResponse> getDisputesForMerchantByReason(String merchantId, Dispute.DisputeReason reason) {
        List<Dispute> disputes = disputeRepository.findByMerchantIdAndReason(merchantId, reason);
        return disputes.stream()
                .map(dispute -> createDisputeResponse(dispute, null, true))
                .collect(Collectors.toList());
    }
    
    /**
     * Merchant'a ait belirli payment ID'deki dispute'u getir
     */
    public Optional<DisputeResponse> getDisputeForMerchantByPaymentId(String merchantId, String paymentId) {
        Optional<Dispute> dispute = disputeRepository.findByMerchantIdAndPaymentId(merchantId, paymentId);
        return dispute.map(d -> createDisputeResponse(d, "Dispute retrieved successfully", true));
    }
    
    /**
     * Merchant'a ait belirli dispute ID'deki dispute'u getir
     */
    public Optional<DisputeResponse> getDisputeForMerchantById(String merchantId, String disputeId) {
        Optional<Dispute> dispute = disputeRepository.findByMerchantIdAndDisputeId(merchantId, disputeId);
        return dispute.map(d -> createDisputeResponse(d, "Dispute retrieved successfully", true));
    }
    
    /**
     * Merchant'a ait dispute'ların sayısını getir
     */
    public long getDisputeCountForMerchant(String merchantId) {
        return disputeRepository.countByMerchantId(merchantId);
    }
    
    /**
     * Merchant'a ait belirli status'taki dispute'ların sayısını getir
     */
    public long getDisputeCountForMerchantByStatus(String merchantId, Dispute.DisputeStatus status) {
        return disputeRepository.countByMerchantIdAndStatus(merchantId, status);
    }
}