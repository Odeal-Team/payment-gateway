package com.payment.gateway.service;

import com.payment.gateway.dto.RefundRequest;
import com.payment.gateway.dto.RefundResponse;
import com.payment.gateway.model.Refund;
import com.payment.gateway.repository.RefundRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.payment.gateway.model.AuditLog;


import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class RefundService {
    
    private final RefundRepository refundRepository;
    private final AuditService auditService;
    private final PaymentService paymentService;
    private final MerchantContextService merchantContextService;

    public RefundResponse createRefund(RefundRequest request) {
        try {
            // Validate payment exists and get payment details
            var paymentResponse = paymentService.getPaymentByPaymentId(request.getPaymentId());
            BigDecimal originalAmount = paymentResponse.getAmount();

            // Get existing refunds for this payment
            List<Refund> existingRefunds = refundRepository.findByPaymentId(request.getPaymentId())
                .stream()
                .filter(refund -> refund.getStatus() == Refund.RefundStatus.COMPLETED)
                .collect(Collectors.toList());

            // Calculate total already refunded amount
            BigDecimal totalRefunded = existingRefunds.stream()
                .map(Refund::getAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

            // Validate refund amount
            BigDecimal availableAmount = originalAmount.subtract(totalRefunded);
            if (request.getAmount().compareTo(availableAmount) > 0) {
                throw new IllegalArgumentException(
                    String.format("Refund amount %s exceeds available amount %s for payment %s", 
                        request.getAmount(), availableAmount, request.getPaymentId())
                );
            }
            
            if (request.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
                throw new IllegalArgumentException("Refund amount must be greater than 0");
            }
            
            // Generate unique refund ID
            String refundId = generateRefundId();
            
            // Create refund entity
            Refund refund = new Refund();
            refund.setRefundId(refundId);
            refund.setPaymentId(request.getPaymentId());
            refund.setTransactionId(request.getTransactionId());
            refund.setMerchantId(request.getMerchantId());
            refund.setCustomerId(request.getCustomerId());
            refund.setAmount(request.getAmount());
            refund.setCurrency(request.getCurrency());
            refund.setStatus(Refund.RefundStatus.PENDING);
            refund.setReason(request.getReason());
            refund.setDescription(request.getDescription());
            refund.setRefundDate(LocalDateTime.now());
            
            // Process refund through gateway (simulated)
            Refund.RefundStatus finalStatus = processRefundThroughGateway(refund);
            refund.setStatus(finalStatus);
            
            // Save refund
            Refund savedRefund = refundRepository.save(refund);
            
            // Audit logging
            auditService.createEvent()
                .eventType("REFUND_CREATED")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("system")
                .action("CREATE")
                .resourceType("REFUND")
                .resourceId(refundId)
                .newValues(savedRefund)
                .additionalData("paymentId", request.getPaymentId())
                .additionalData("merchantId", request.getMerchantId())
                .additionalData("amount", request.getAmount().toString())
                .complianceTag("PCI_DSS")
                .log();
            
            log.info("Refund created successfully with ID: {}", refundId);
            
            return createRefundResponse(savedRefund, "Refund created successfully", true);
            
        } catch (Exception e) {
            log.error("Error creating refund: {}", e.getMessage());
            return createErrorResponse("Failed to create refund: " + e.getMessage());
        }
    }

    /**
     * Merchant ID ile kısıtlanmış refund oluşturma
     */
    public RefundResponse createRefundForMerchant(RefundRequest request, String merchantId) {
        try {
            // Payment'ın bu merchant'a ait olduğunu doğrula
            var paymentResponse = paymentService.getPaymentByPaymentIdForMerchant(request.getPaymentId(), merchantId);
            
            if (!paymentResponse.isSuccess()) {
                log.warn("🚫 Merchant {} tried to create refund for payment {} not owned by them", 
                    merchantId, request.getPaymentId());
                return createErrorResponse("Payment not found or access denied");
            }

            // Normal refund oluşturma işlemini devam ettir
            return createRefund(request);
            
        } catch (Exception e) {
            log.error("Error creating refund for merchant {}: {}", merchantId, e.getMessage(), e);
            return createErrorResponse("Failed to create refund: " + e.getMessage());
        }
    }
    
    public RefundResponse getRefundById(Long id) {
        Optional<Refund> refund = refundRepository.findById(id);
        if (refund.isPresent()) {
            return createRefundResponse(refund.get(), "Refund retrieved successfully", true);
        } else {
            return createErrorResponse("Refund not found with ID: " + id);
        }
    }
    
    /**
     * Merchant ID ile kısıtlanmış refund ID ile arama
     */
    public RefundResponse getRefundByIdForMerchant(Long id, String merchantId) {
        Optional<Refund> refund = refundRepository.findById(id);
        if (refund.isPresent()) {
            Refund r = refund.get();
            // Payment'ın merchant'ına bak (refund'da direct merchant ID yok)
            var payment = paymentService.getPaymentByPaymentId(r.getPaymentId());
            if (!payment.isSuccess() || !payment.getMerchantId().equals(merchantId)) {
                log.warn("🚫 Merchant {} tried to access refund {} not owned by them", merchantId, id);
                return createErrorResponse("Refund not found or access denied");
            }
            return createRefundResponse(r, "Refund retrieved successfully", true);
        } else {
            return createErrorResponse("Refund not found with ID: " + id);
        }
    }
    
    // Merchant-aware refund methods
    public RefundResponse getRefundByRefundIdForMerchant(String refundId, String merchantId) {
        Optional<Refund> refund = refundRepository.findByRefundId(refundId);
        if (refund.isPresent() && refund.get().getMerchantId().equals(merchantId)) {
            return createRefundResponse(refund.get(), "Refund retrieved successfully", true);
        } else {
            return createErrorResponse("Refund not found with refund ID: " + refundId + " for merchant: " + merchantId);
        }
    }
    
    public RefundResponse getRefundByPaymentIdForMerchant(String paymentId, String merchantId) {
        Optional<Refund> refund = refundRepository.findByPaymentId(paymentId);
        if (refund.isPresent() && refund.get().getMerchantId().equals(merchantId)) {
            return createRefundResponse(refund.get(), "Refund retrieved successfully", true);
        } else {
            return createErrorResponse("Refund not found with payment ID: " + paymentId + " for merchant: " + merchantId);
        }
    }
    
    public List<RefundResponse> getRefundsByCustomerIdForMerchant(String customerId, String merchantId) {
        List<Refund> refunds = refundRepository.findByCustomerId(customerId);
        return refunds.stream()
                .filter(refund -> refund.getMerchantId().equals(merchantId))
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public List<RefundResponse> getRefundsByStatusForMerchant(Refund.RefundStatus status, String merchantId) {
        List<Refund> refunds = refundRepository.findByStatus(status);
        return refunds.stream()
                .filter(refund -> refund.getMerchantId().equals(merchantId))
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public List<RefundResponse> getRefundsByReasonForMerchant(Refund.RefundReason reason, String merchantId) {
        List<Refund> refunds = refundRepository.findByReason(reason);
        return refunds.stream()
                .filter(refund -> refund.getMerchantId().equals(merchantId))
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public List<RefundResponse> getRefundsByTransactionIdForMerchant(String transactionId, String merchantId) {
        List<Refund> refunds = refundRepository.findByTransactionId(transactionId);
        return refunds.stream()
                .filter(refund -> refund.getMerchantId().equals(merchantId))
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public RefundResponse getRefundByRefundId(String refundId) {
        Optional<Refund> refund = refundRepository.findByRefundId(refundId);
        if (refund.isPresent()) {
            return createRefundResponse(refund.get(), "Refund retrieved successfully", true);
        } else {
            return createErrorResponse("Refund not found with refund ID: " + refundId);
        }
    }
    
    public RefundResponse getRefundByPaymentId(String paymentId) {
        Optional<Refund> refund = refundRepository.findByPaymentId(paymentId);
        if (refund.isPresent()) {
            return createRefundResponse(refund.get(), "Refund retrieved successfully", true);
        } else {
            return createErrorResponse("Refund not found with payment ID: " + paymentId);
        }
    }
    
    public List<RefundResponse> getAllRefunds() {
        List<Refund> refunds;
        
        if (merchantContextService.isAdminUser()) {
            // Admin tüm refund'ları görebilir
            refunds = refundRepository.findAll();
        } else {
            // Merchant sadece kendi refund'larını görebilir
            String currentMerchantId = merchantContextService.getCurrentMerchantId();
            if (currentMerchantId != null) {
                refunds = refundRepository.findByMerchantId(currentMerchantId);
            } else {
                return List.of(); // Merchant ID bulunamadı
            }
        }
        return refunds.stream()
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public List<RefundResponse> getRefundsByMerchantId(String merchantId) {
        List<Refund> refunds = refundRepository.findByMerchantId(merchantId);
        return refunds.stream()
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public List<RefundResponse> getRefundsByCustomerId(String customerId) {
        List<Refund> refunds = refundRepository.findByCustomerId(customerId);
        return refunds.stream()
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public List<RefundResponse> getRefundsByStatus(Refund.RefundStatus status) {
        List<Refund> refunds = refundRepository.findByStatus(status);
        return refunds.stream()
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public List<RefundResponse> getRefundsByReason(Refund.RefundReason reason) {
        List<Refund> refunds = refundRepository.findByReason(reason);
        return refunds.stream()
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public List<RefundResponse> getRefundsByTransactionId(String transactionId) {
        List<Refund> refunds = refundRepository.findByTransactionId(transactionId);
        return refunds.stream()
                .map(refund -> createRefundResponse(refund, null, true))
                .collect(Collectors.toList());
    }
    
    public RefundResponse updateRefund(Long id, RefundRequest request) {
        Optional<Refund> refundOpt = refundRepository.findById(id);
        if (refundOpt.isPresent()) {
            Refund refund = refundOpt.get();
            
            // Update refund fields
            refund.setAmount(request.getAmount());
            refund.setCurrency(request.getCurrency());
            refund.setReason(request.getReason());
            refund.setDescription(request.getDescription());
            
            Refund updatedRefund = refundRepository.save(refund);
            
            log.info("Refund updated successfully with ID: {}", id);
            return createRefundResponse(updatedRefund, "Refund updated successfully", true);
        } else {
            return createErrorResponse("Refund not found with ID: " + id);
        }
    }
    
    public RefundResponse updateRefundStatus(Long id, Refund.RefundStatus newStatus) {
        Optional<Refund> refundOpt = refundRepository.findById(id);
        if (refundOpt.isPresent()) {
            Refund refund = refundOpt.get();
            refund.setStatus(newStatus);
            refund.setGatewayResponse("Status updated to: " + newStatus);
            Refund updatedRefund = refundRepository.save(refund);
            
            log.info("Refund status updated to {} for ID: {}", newStatus, id);
            return createRefundResponse(updatedRefund, "Refund status updated successfully", true);
        } else {
            return createErrorResponse("Refund not found with ID: " + id);
        }
    }
    
    public RefundResponse completeRefund(String refundId) {
        try {
            Optional<Refund> refundOpt = refundRepository.findByRefundId(refundId);
            if (refundOpt.isEmpty()) {
                return createErrorResponse("Refund not found with ID: " + refundId);
            }
            
            Refund refund = refundOpt.get();
            
            if (refund.getStatus() != Refund.RefundStatus.PROCESSING) {
                return createErrorResponse("Only PROCESSING refunds can be completed. Current status: " + refund.getStatus());
            }
            
            // Manuel olarak tamamla
            refund.setStatus(Refund.RefundStatus.COMPLETED);
            refund.setGatewayResponse("Refund processed successfully - Manually approved");
            refund.setUpdatedAt(LocalDateTime.now());
            
            Refund savedRefund = refundRepository.save(refund);
            
            // Audit logging
            auditService.createEvent()
                .eventType("REFUND_COMPLETED")
                .severity(AuditLog.Severity.MEDIUM)
                .actor("admin")
                .action("UPDATE")
                .resourceType("REFUND")
                .resourceId(refundId)
                .newValues(savedRefund)
                .additionalData("action", "manual_completion")
                .complianceTag("PCI_DSS")
                .log();
            
            log.info("Refund {} manually completed", refundId);
            return createRefundResponse(savedRefund, "Refund completed successfully", true);
            
        } catch (Exception e) {
            log.error("Error completing refund: {}", e.getMessage());
            return createErrorResponse("Failed to complete refund: " + e.getMessage());
        }
    }
    
    public RefundResponse cancelRefund(String refundId) {
        try {
            Optional<Refund> refundOpt = refundRepository.findByRefundId(refundId);
            if (refundOpt.isEmpty()) {
                return createErrorResponse("Refund not found with ID: " + refundId);
            }
            
            Refund refund = refundOpt.get();
            
            if (refund.getStatus() == Refund.RefundStatus.COMPLETED) {
                return createErrorResponse("Cannot cancel a completed refund");
            }
            
            // Manuel olarak iptal et
            refund.setStatus(Refund.RefundStatus.FAILED);
            refund.setGatewayResponse("Refund cancelled - Manually rejected");
            refund.setUpdatedAt(LocalDateTime.now());
            
            Refund savedRefund = refundRepository.save(refund);
            
            // Audit logging
            auditService.createEvent()
                .eventType("REFUND_CANCELLED")
                .severity(AuditLog.Severity.HIGH)
                .actor("admin")
                .action("UPDATE")
                .resourceType("REFUND")
                .resourceId(refundId)
                .newValues(savedRefund)
                .additionalData("action", "manual_cancellation")
                .complianceTag("PCI_DSS")
                .log();
            
            log.info("Refund {} manually cancelled", refundId);
            return createRefundResponse(savedRefund, "Refund cancelled successfully", true);
            
        } catch (Exception e) {
            log.error("Error cancelling refund: {}", e.getMessage());
            return createErrorResponse("Failed to cancel refund: " + e.getMessage());
        }
    }
    
    private String generateRefundId() {
        return "REF-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
    
    private Refund.RefundStatus processRefundThroughGateway(Refund refund) {
        try {
            log.info("Processing refund through bank gateway for refund ID: {}", refund.getRefundId());
            
            // Banka entegrasyonu - gerçek banka API'sine istek at
            Refund.RefundStatus bankResponse = processRefundWithBank(refund);
            
            if (bankResponse == Refund.RefundStatus.PROCESSING) {
                refund.setGatewayResponse("Refund request sent to bank - processing");
                refund.setGatewayRefundId("GREF-" + UUID.randomUUID().toString().substring(0, 8));
            } else if (bankResponse == Refund.RefundStatus.FAILED) {
                refund.setGatewayResponse("Bank rejected refund request");
                refund.setGatewayRefundId("GREF-" + UUID.randomUUID().toString().substring(0, 8));
            }
            
            return bankResponse;
            
        } catch (Exception e) {
            log.error("Error processing refund through gateway: {}", e.getMessage());
            refund.setGatewayResponse("Gateway error: " + e.getMessage());
            return Refund.RefundStatus.FAILED;
        }
    }
    
    /**
     * Banka'ya refund isteği gönder
     */
    private Refund.RefundStatus processRefundWithBank(Refund refund) {
        try {
            // Payment bilgilerini al (hangi banka ile yapıldığını öğrenmek için)
            String bankType = determineBankType(refund.getTransactionId());
            
            switch (bankType) {
                case "GARANTI":
                    return processRefundWithGaranti(refund);
                case "ISBANK":
                    return processRefundWithIsBank(refund);
                case "AKBANK":
                    return processRefundWithAkbank(refund);
                default:
                    log.error("Unknown bank type for transaction: {}", refund.getTransactionId());
                    return Refund.RefundStatus.FAILED;
            }
            
        } catch (Exception e) {
            log.error("Error determining bank type: {}", e.getMessage());
            return Refund.RefundStatus.FAILED;
        }
    }
    
    /**
     * Transaction ID'den banka tipini belirle
     */
    private String determineBankType(String transactionId) {
        // Transaction ID formatına göre banka belirleme
        // Gerçek implementasyonda bu bilgi payment tablosundan alınır
        if (transactionId.startsWith("GAR")) {
            return "GARANTI";
        } else if (transactionId.startsWith("ISB")) {
            return "ISBANK";
        } else if (transactionId.startsWith("AKB")) {
            return "AKBANK";
        } else if (transactionId.startsWith("TXN-")) {
            // TXN- ile başlayan transaction ID'ler için default olarak Garanti kullan
            log.info("Transaction ID {} TXN- format detected, using GARANTI as default bank", transactionId);
            return "GARANTI";
        } else {
            return "UNKNOWN";
        }
    }
    
    /**
     * Garanti BBVA'ya refund isteği gönder
     */
    private Refund.RefundStatus processRefundWithGaranti(Refund refund) {
        try {
            log.info("Sending refund request to Garanti BBVA for amount: {}", refund.getAmount());
            
            // Garanti BBVA API'sine refund isteği
            String garantiResponse = sendRefundRequestToGaranti(refund);
            
            if (garantiResponse.contains("SUCCESS")) {
                log.info("Garanti BBVA refund request successful");
                return Refund.RefundStatus.PROCESSING;
            } else {
                log.error("Garanti BBVA refund request failed: {}", garantiResponse);
                return Refund.RefundStatus.FAILED;
            }
            
        } catch (Exception e) {
            log.error("Error processing refund with Garanti BBVA: {}", e.getMessage());
            return Refund.RefundStatus.FAILED;
        }
    }
    
    /**
     * İş Bankası'na refund isteği gönder
     */
    private Refund.RefundStatus processRefundWithIsBank(Refund refund) {
        try {
            log.info("Sending refund request to İş Bankası for amount: {}", refund.getAmount());
            
            // İş Bankası API'sine refund isteği
            String isbankResponse = sendRefundRequestToIsBank(refund);
            
            if (isbankResponse.contains("SUCCESS")) {
                refund.setGatewayResponse("İş Bankası refund request successful");
                return Refund.RefundStatus.PROCESSING;
            } else {
                log.error("İş Bankası refund request failed: {}", isbankResponse);
                return Refund.RefundStatus.FAILED;
            }
            
        } catch (Exception e) {
            log.error("Error processing refund with İş Bankası: {}", e.getMessage());
            return Refund.RefundStatus.FAILED;
        }
    }
    
    /**
     * Akbank'a refund isteği gönder
     */
    private Refund.RefundStatus processRefundWithAkbank(Refund refund) {
        try {
            log.info("Sending refund request to Akbank for amount: {}", refund.getAmount());
            
            // Akbank API'sine refund isteği
            String akbankResponse = sendRefundRequestToAkbank(refund);
            
            if (akbankResponse.contains("SUCCESS")) {
                log.info("Akbank refund request successful");
                return Refund.RefundStatus.PROCESSING;
            } else {
                log.error("Akbank refund request failed: {}", akbankResponse);
                return Refund.RefundStatus.FAILED;
            }
            
        } catch (Exception e) {
            log.error("Error processing refund with Akbank: {}", e.getMessage());
            return Refund.RefundStatus.FAILED;
        }
    }
    
    /**
     * Garanti BBVA API'sine refund isteği gönder (simulated)
     */
    private String sendRefundRequestToGaranti(Refund refund) {
        // Simulated Garanti BBVA API call
        // Gerçek implementasyonda HTTP client ile API çağrısı yapılır
        try {
            Thread.sleep(200); // Simulate API call delay
            
            // Simulate success/failure based on amount
            if (refund.getAmount().compareTo(java.math.BigDecimal.valueOf(1000000)) > 0) {
                return "FAILED: Amount exceeds limit";
            } else {
                return "SUCCESS: Refund request accepted";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "FAILED: Request interrupted";
        }
    }
    
    /**
     * İş Bankası API'sine refund isteği gönder (simulated)
     */
    private String sendRefundRequestToIsBank(Refund refund) {
        // Simulated İş Bankası API call
        try {
            Thread.sleep(150); // Simulate API call delay
            
            if (refund.getAmount().compareTo(java.math.BigDecimal.valueOf(1000000)) > 0) {
                return "FAILED: Amount exceeds limit";
            } else {
                return "SUCCESS: Refund request accepted";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "FAILED: Request interrupted";
        }
    }
    
    /**
     * Akbank API'sine refund isteği gönder (simulated)
     */
    private String sendRefundRequestToAkbank(Refund refund) {
        // Simulated Akbank API call
        try {
            Thread.sleep(180); // Simulate API call delay
            
            if (refund.getAmount().compareTo(java.math.BigDecimal.valueOf(4000)) > 0) {
                return "FAILED: Amount exceeds limit";
            } else {
                return "SUCCESS: Refund request accepted";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "FAILED: Request interrupted";
        }
    }
    
    private RefundResponse createRefundResponse(Refund refund, String message, boolean success) {
        RefundResponse response = new RefundResponse();
        response.setId(refund.getId());
        response.setRefundId(refund.getRefundId());
        response.setPaymentId(refund.getPaymentId());
        response.setTransactionId(refund.getTransactionId());
        response.setMerchantId(refund.getMerchantId());
        response.setCustomerId(refund.getCustomerId());
        response.setAmount(refund.getAmount());
        response.setCurrency(refund.getCurrency());
        response.setStatus(refund.getStatus());
        response.setReason(refund.getReason());
        response.setDescription(refund.getDescription());
        response.setGatewayResponse(refund.getGatewayResponse());
        response.setGatewayRefundId(refund.getGatewayRefundId());
        response.setRefundDate(refund.getRefundDate());
        response.setCreatedAt(refund.getCreatedAt());
        response.setUpdatedAt(refund.getUpdatedAt());
        response.setMessage(message);
        response.setSuccess(success);
        return response;
    }
    
    private RefundResponse createErrorResponse(String errorMessage) {
        RefundResponse response = new RefundResponse();
        response.setMessage(errorMessage);
        response.setSuccess(false);
        return response;
    }
    
    /**
     * Banka'dan gelen refund webhook'ını işle
     */
    public void processBankRefundWebhook(String bankType, String webhookData) {
        try {
            log.info("Processing {} refund webhook: {}", bankType, webhookData);
            
            // Webhook data'sını parse et (gerçek implementasyonda JSON parsing yapılır)
            // Bu örnekte basit string parsing kullanıyoruz
            String[] parts = webhookData.split("\\|");
            if (parts.length >= 3) {
                String refundId = parts[0];
                String status = parts[1];
                String message = parts[2];
                
                // Refund ID ile refund'ı bul
                Optional<Refund> refundOpt = refundRepository.findByRefundId(refundId);
                if (refundOpt.isPresent()) {
                    Refund refund = refundOpt.get();
                    
                    // Banka'dan gelen status'a göre güncelle
                    Refund.RefundStatus newStatus = mapBankStatusToRefundStatus(status);
                    refund.setStatus(newStatus);
                    refund.setGatewayResponse(bankType + " webhook: " + message);
                    refund.setUpdatedAt(LocalDateTime.now());
                    
                    // Eğer refund tamamlandıysa tarih ekle
                    if (newStatus == Refund.RefundStatus.COMPLETED) {
                        refund.setRefundDate(LocalDateTime.now());
                    }
                    
                    refundRepository.save(refund);
                    
                    // Audit logging
                    auditService.createEvent()
                        .eventType("REFUND_STATUS_UPDATED_VIA_WEBHOOK")
                        .severity(AuditLog.Severity.MEDIUM)
                        .actor(bankType)
                        .action("UPDATE")
                        .resourceType("REFUND")
                        .resourceId(refund.getRefundId())
                        .additionalData("bankType", bankType)
                        .additionalData("newStatus", newStatus.toString())
                        .additionalData("webhookMessage", message)
                        .complianceTag("PCI_DSS")
                        .log();
                    
                    log.info("Refund status updated via {} webhook to {} for refund ID: {}", 
                            bankType, newStatus, refund.getRefundId());
                    
                    // Merchant'a webhook gönder (refund durumu değişti)
                    notifyMerchantAboutRefundStatus(refund);
                    
                } else {
                    log.warn("Refund not found for refund ID: {}", refundId);
                }
            } else {
                log.error("Invalid webhook data format: {}", webhookData);
            }
            
        } catch (Exception e) {
            log.error("Error processing {} refund webhook: {}", bankType, e.getMessage());
            throw new RuntimeException("Failed to process refund webhook", e);
        }
    }
    
    /**
     * Banka status'unu refund status'una map et
     */
    private Refund.RefundStatus mapBankStatusToRefundStatus(String bankStatus) {
        switch (bankStatus.toUpperCase()) {
            case "SUCCESS":
            case "COMPLETED":
                return Refund.RefundStatus.COMPLETED;
            case "FAILED":
            case "REJECTED":
                return Refund.RefundStatus.FAILED;
            case "PROCESSING":
            case "PENDING":
                return Refund.RefundStatus.PROCESSING;
            case "CANCELLED":
                return Refund.RefundStatus.CANCELLED;
            default:
                log.warn("Unknown bank status: {}, defaulting to PROCESSING", bankStatus);
                return Refund.RefundStatus.PROCESSING;
        }
    }
    
    /**
     * Merchant'a refund durumu değişikliği hakkında bildirim gönder
     */
    private void notifyMerchantAboutRefundStatus(Refund refund) {
        try {
            log.info("Notifying merchant {} about refund status change for refund ID: {}", 
                    refund.getMerchantId(), refund.getRefundId());
            
            // WebhookService ile merchant'a webhook gönder (şimdilik sadece log)
            String eventType;
            switch (refund.getStatus()) {
                case COMPLETED:
                    eventType = "REFUND_COMPLETED";
                    break;
                case FAILED:
                    eventType = "REFUND_FAILED";
                    break;
                case PROCESSING:
                    eventType = "REFUND_CREATED";
                    break;
                default:
                    eventType = "REFUND_CREATED";
            }
            
            log.info("Webhook would be triggered for merchant {} - Event: {} (temporarily disabled)", refund.getMerchantId(), eventType);
            
        } catch (Exception e) {
            log.error("Error notifying merchant about refund status: {}", e.getMessage());
        }
    }
}