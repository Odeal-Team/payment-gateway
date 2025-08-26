package com.payment.gateway.service;

import com.payment.gateway.dto.PaymentRequest;
import com.payment.gateway.dto.PaymentResponse;
import com.payment.gateway.model.Payment;
import com.payment.gateway.model.RiskAssessment;
import com.payment.gateway.repository.PaymentRepository;
import com.payment.gateway.util.CardUtils;
import com.payment.gateway.model.AuditLog;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class PaymentService {
    
    private final PaymentRepository paymentRepository;
    private final RealBankIntegrationService realBankIntegrationService;
    private final RiskAssessmentService riskAssessmentService;
    private final AuditService auditService;
    private final MerchantContextService merchantContextService;

    @Transactional(noRollbackFor = DataIntegrityViolationException.class)
    public PaymentResponse createPayment(PaymentRequest request, String ipAddress, String userAgent) {
        
        // Audit log - Payment initiation
        auditService.logEvent(
            auditService.createEvent()
                .eventType("PAYMENT")
                .action("INITIATE")
                .actor("api-user")
                .resourceType("Payment")
                .resourceId(request.getMerchantId() + "-" + request.getCustomerId())
                .additionalData("amount", request.getAmount())
                .additionalData("currency", request.getCurrency())
                .additionalData("paymentMethod", request.getPaymentMethod())
                .additionalData("cardLastFour", CardUtils.extractCardLastFour(request.getCardNumber()))
                .complianceTag("PCI_DSS")
                .complianceTag("KVKK")
                .complianceTag("GDPR")
        );
        
        try {
            // Generate unique payment ID and transaction ID
            String paymentId = generatePaymentId();
            String transactionId = generateTransactionId();
            
            // Create payment entity
            Payment payment = new Payment();
            payment.setPaymentId(paymentId);
            payment.setTransactionId(transactionId);
            payment.setMerchantId(request.getMerchantId());
            payment.setCustomerId(request.getCustomerId());
            payment.setAmount(request.getAmount());
            payment.setCurrency(request.getCurrency());
            payment.setStatus(Payment.PaymentStatus.PENDING);
            payment.setPaymentMethod(request.getPaymentMethod());
            payment.setCardNumber(CardUtils.maskCardNumber(request.getCardNumber()));
            payment.setCardHolderName(request.getCardHolderName());
            payment.setCardBrand(CardUtils.detectCardBrand(request.getCardNumber()));
            payment.setCardBin(CardUtils.extractCardBin(request.getCardNumber()));
            payment.setCardLastFour(CardUtils.extractCardLastFour(request.getCardNumber()));
            payment.setExpiryDate(request.getExpiryDate());
            payment.setDescription(request.getDescription());
            payment.setCreatedAt(LocalDateTime.now());
            
            // Save initial payment record
            payment = paymentRepository.save(payment);
            log.info("Payment created with ID: {}", paymentId);
            
            // FRAUD DETECTION - Risk Assessment
            log.info("Starting fraud detection for payment: {}", paymentId);
            RiskAssessment riskAssessment = riskAssessmentService.assessPaymentRisk(
                request, payment, ipAddress, userAgent);
            
            // Audit log - Risk Assessment
            auditService.logEvent(
                auditService.createEvent()
                    .eventType("FRAUD_DETECTION")
                    .action("RISK_ASSESSMENT")
                    .actor("system")
                    .resourceType("Payment")
                    .resourceId(paymentId)
                    .additionalData("riskLevel", riskAssessment.getRiskLevel().name())
                    .additionalData("riskScore", riskAssessment.getRiskScore())
                    .additionalData("action", riskAssessment.getAction().name())
                    .additionalData("riskFactors", riskAssessment.getRiskFactors())
                    .complianceTag("PCI_DSS")
                    .complianceTag("AML")
            );
            
            // Check risk assessment result
            if (riskAssessment.getAction() == RiskAssessment.AssessmentAction.DECLINE) {
                payment.setStatus(Payment.PaymentStatus.FAILED);
                payment.setGatewayResponse("Payment declined due to high fraud risk: " + riskAssessment.getRiskLevel());
                payment = paymentRepository.save(payment);
                
                log.warn("Payment {} declined due to fraud risk - Risk Level: {}, Score: {}", 
                        paymentId, riskAssessment.getRiskLevel(), riskAssessment.getRiskScore());
                
                // Audit log - Payment declined due to fraud
                auditService.logEvent(
                    auditService.createEvent()
                        .eventType("PAYMENT")
                        .action("DECLINE")
                        .actor("fraud-system")
                        .resourceType("Payment")
                        .resourceId(paymentId)
                        .additionalData("reason", "HIGH_FRAUD_RISK")
                        .additionalData("riskScore", riskAssessment.getRiskScore())
                        .complianceTag("PCI_DSS")
                        .complianceTag("AML")
                );
                
                return createPaymentResponse(payment, 
                    "Payment declined due to security concerns. Risk Score: " + riskAssessment.getRiskScore(), false);
            }
            
            if (riskAssessment.getAction() == RiskAssessment.AssessmentAction.REVIEW) {
                payment.setStatus(Payment.PaymentStatus.CANCELLED); // Hold for manual review
                payment.setGatewayResponse("Payment held for manual review due to elevated fraud risk");
                payment = paymentRepository.save(payment);
                
                log.warn("Payment {} held for manual review - Risk Level: {}, Score: {}", 
                        paymentId, riskAssessment.getRiskLevel(), riskAssessment.getRiskScore());
                
                return createPaymentResponse(payment, 
                    "Payment is being reviewed for security. You will be notified of the outcome.", false);
            }
            
            // Process payment through gateway
            payment.setStatus(Payment.PaymentStatus.PROCESSING);
            payment = paymentRepository.save(payment);
            
            Payment.PaymentStatus finalStatus;
            
            // Additional verification for medium risk transactions
            if (riskAssessment.getAction() == RiskAssessment.AssessmentAction.CHALLENGE) {
                log.info("Payment {} requires additional verification - implementing 3D Secure flow", paymentId);
                // In a real implementation, this would redirect to 3D Secure
                finalStatus = processPaymentThroughGateway(request, payment);
            } else {
                // Low risk - proceed normally
                finalStatus = processPaymentThroughGateway(request, payment);
            }
            
            payment.setStatus(finalStatus);
            
            // Set completedAt if payment is successful
            if (finalStatus == Payment.PaymentStatus.COMPLETED) {
                payment.setCompletedAt(LocalDateTime.now());
            }
            
            // Save final payment status
            payment = paymentRepository.save(payment);
            
            // Audit log - Payment completion status
            auditService.logEvent(
                auditService.createEvent()
                    .eventType("PAYMENT")
                    .action(finalStatus == Payment.PaymentStatus.COMPLETED ? "COMPLETE" : "FAIL")
                    .actor("system")
                    .resourceType("Payment")
                    .resourceId(payment.getPaymentId())
                    .additionalData("transactionId", payment.getTransactionId())
                    .additionalData("status", finalStatus.name())
                    .additionalData("amount", payment.getAmount())
                    .additionalData("currency", payment.getCurrency())
                    .additionalData("gatewayResponse", payment.getGatewayResponse())
                    .complianceTag("PCI_DSS")
                    .complianceTag("KVKK")
                    .complianceTag("GDPR")
            );
            
            return createPaymentResponse(payment, "Payment processed successfully", true);
            
        } catch (DataIntegrityViolationException e) {
            log.error("Data integrity violation while creating payment: {}", e.getMessage());
            if (e.getMessage().contains("merchant_id")) {
                return createErrorResponse("Invalid merchant ID: " + request.getMerchantId());
            } else if (e.getMessage().contains("customer_id")) {
                return createErrorResponse("Invalid customer ID: " + request.getCustomerId());
            } else {
                return createErrorResponse("Data validation failed: " + e.getMessage());
            }
        } catch (Exception e) {
            log.error("Error creating payment: {}", e.getMessage());
            return createErrorResponse("Failed to process payment: " + e.getMessage());
        }
    }
    
    public PaymentResponse getPaymentById(Long id) {
        Optional<Payment> payment = paymentRepository.findById(id);
        if (payment.isPresent()) {
            return createPaymentResponse(payment.get(), "Payment retrieved successfully", true);
        } else {
            return createErrorResponse("Payment not found with ID: " + id);
        }
    }
    
    /**
     * Merchant ID ile kısıtlanmış payment arama
     */
    public PaymentResponse getPaymentByIdForMerchant(Long id, String merchantId) {
        Optional<Payment> payment = paymentRepository.findById(id);
        if (payment.isPresent()) {
            Payment p = payment.get();
            // Merchant ID kontrolü
            if (!p.getMerchantId().equals(merchantId)) {
                log.warn("🚫 Merchant {} tried to access payment {} owned by {}", 
                    merchantId, id, p.getMerchantId());
                return createErrorResponse("Payment not found or access denied");
            }
            return createPaymentResponse(p, "Payment retrieved successfully", true);
        } else {
            return createErrorResponse("Payment not found with ID: " + id);
        }
    }
    
    public PaymentResponse getPaymentByTransactionId(String transactionId) {
        Optional<Payment> payment = paymentRepository.findByTransactionId(transactionId);
        if (payment.isPresent()) {
            return createPaymentResponse(payment.get(), "Payment retrieved successfully", true);
        } else {
            return createErrorResponse("Payment not found with transaction ID: " + transactionId);
        }
    }

    /**
     * Merchant ID ile kısıtlanmış transaction ID ile payment arama
     */
    public PaymentResponse getPaymentByTransactionIdForMerchant(String transactionId, String merchantId) {
        Optional<Payment> payment = paymentRepository.findByTransactionId(transactionId);
        if (payment.isPresent()) {
            Payment p = payment.get();
            // Merchant ID kontrolü
            if (!p.getMerchantId().equals(merchantId)) {
                log.warn("🚫 Merchant {} tried to access payment {} owned by {}", 
                    merchantId, transactionId, p.getMerchantId());
                return createErrorResponse("Payment not found or access denied");
            }
            return createPaymentResponse(p, "Payment retrieved successfully", true);
        } else {
            return createErrorResponse("Payment not found with transaction ID: " + transactionId);
        }
    }
    
    public PaymentResponse getPaymentByPaymentId(String paymentId) {
        Optional<Payment> payment = paymentRepository.findByPaymentId(paymentId);
        if (payment.isPresent()) {
            return createPaymentResponse(payment.get(), "Payment retrieved successfully", true);
        } else {
            return createErrorResponse("Payment not found with payment ID: " + paymentId);
        }
    }
    
    /**
     * Merchant ID ile kısıtlanmış payment ID ile payment arama
     */
    public PaymentResponse getPaymentByPaymentIdForMerchant(String paymentId, String merchantId) {
        Optional<Payment> payment = paymentRepository.findByPaymentId(paymentId);
        if (payment.isPresent()) {
            Payment p = payment.get();
            // Merchant ID kontrolü
            if (!p.getMerchantId().equals(merchantId)) {
                log.warn("🚫 Merchant {} tried to access payment {} owned by {}", 
                    merchantId, paymentId, p.getMerchantId());
                return createErrorResponse("Payment not found or access denied");
            }
            return createPaymentResponse(p, "Payment retrieved successfully", true);
        } else {
            return createErrorResponse("Payment not found with payment ID: " + paymentId);
        }
    }
    
    public List<PaymentResponse> getAllPayments() {
        List<Payment> payments;
        
        if (merchantContextService.isAdminUser()) {
            // Admin tüm ödemeleri görebilir
            payments = paymentRepository.findAll();
        } else {
            // Merchant sadece kendi ödemelerini görebilir
            String currentMerchantId = merchantContextService.getCurrentMerchantId();
            if (currentMerchantId != null) {
                payments = paymentRepository.findByMerchantId(currentMerchantId);
            } else {
                return List.of(); // Merchant ID bulunamadı
            }
        }
        
        return payments.stream()
                .map(payment -> createPaymentResponse(payment, null, true))
                .collect(Collectors.toList());
    }
    
    public List<PaymentResponse> getPaymentsByMerchantId(String merchantId) {
        List<Payment> payments = paymentRepository.findByMerchantId(merchantId);
        return payments.stream()
                .map(payment -> createPaymentResponse(payment, null, true))
                .collect(Collectors.toList());
    }
    
    public List<PaymentResponse> getPaymentsByCustomerId(String customerId) {
        List<Payment> payments = paymentRepository.findByCustomerId(customerId);
        return payments.stream()
                .map(payment -> createPaymentResponse(payment, null, true))
                .collect(Collectors.toList());
    }
    
    /**
     * Merchant ID ile kısıtlanmış customer payment arama
     */
    public List<PaymentResponse> getPaymentsByCustomerIdForMerchant(String customerId, String merchantId) {
        List<Payment> payments = paymentRepository.findByCustomerId(customerId);
        return payments.stream()
                .filter(payment -> payment.getMerchantId().equals(merchantId)) // Sadece bu merchant'ın payment'ları
                .map(payment -> createPaymentResponse(payment, null, true))
                .collect(Collectors.toList());
    }
    
    public List<PaymentResponse> getPaymentsByStatus(Payment.PaymentStatus status) {
        List<Payment> payments = paymentRepository.findByStatus(status);
        return payments.stream()
                .map(payment -> createPaymentResponse(payment, null, true))
                .collect(Collectors.toList());
    }
    
    public PaymentResponse updatePaymentStatus(Long id, Payment.PaymentStatus newStatus) {
        Optional<Payment> paymentOpt = paymentRepository.findById(id);
        if (paymentOpt.isPresent()) {
            Payment payment = paymentOpt.get();
            Payment.PaymentStatus oldStatus = payment.getStatus();
            payment.setStatus(newStatus);
            
            // Set completedAt if status is being changed to COMPLETED
            if (newStatus == Payment.PaymentStatus.COMPLETED && payment.getCompletedAt() == null) {
                payment.setCompletedAt(LocalDateTime.now());
            }
            
            payment.setGatewayResponse("Status updated to: " + newStatus);
            Payment updatedPayment = paymentRepository.save(payment);
            
            // Audit log - Payment status update
            auditService.logEvent(
                auditService.createEvent()
                    .eventType("PAYMENT")
                    .action("STATUS_UPDATE")
                    .actor("api-user")
                    .resourceType("Payment")
                    .resourceId(payment.getPaymentId())
                    .additionalData("transactionId", payment.getTransactionId())
                    .additionalData("oldStatus", oldStatus.name())
                    .additionalData("newStatus", newStatus.name())
                    .additionalData("amount", payment.getAmount())
                    .complianceTag("PCI_DSS")
            );
            
            log.info("Payment status updated to {} for ID: {}", newStatus, id);
            return createPaymentResponse(updatedPayment, "Payment status updated successfully", true);
        } else {
            return createErrorResponse("Payment not found with ID: " + id);
        }
    }
    
    public PaymentResponse deletePayment(Long id) {
        Optional<Payment> paymentOpt = paymentRepository.findById(id);
        if (paymentOpt.isPresent()) {
            Payment payment = paymentOpt.get();
            
            // Check if payment can be deleted (only pending or failed payments)
            if (payment.getStatus() == Payment.PaymentStatus.PENDING || 
                payment.getStatus() == Payment.PaymentStatus.FAILED) {
                
                paymentRepository.deleteById(id);
                log.info("Payment deleted successfully with ID: {}", id);
                return createPaymentResponse(payment, "Payment deleted successfully", true);
            } else {
                return createErrorResponse("Cannot delete payment with status: " + payment.getStatus());
            }
        } else {
            return createErrorResponse("Payment not found with ID: " + id);
        }
    }
    /* */

    
    /**
     * 3D Secure sürecini tamamlar
     */
    @Transactional
    public PaymentResponse complete3DSecurePayment(String paymentId, String bankTransactionId, String authCode, boolean success) {
        log.info("Completing 3D Secure payment: {}, success: {}", paymentId, success);
        
        try {
            Optional<Payment> paymentOpt = paymentRepository.findByPaymentId(paymentId);
            if (paymentOpt.isEmpty()) {
                return createErrorResponse("Payment not found: " + paymentId);
            }
            
            Payment payment = paymentOpt.get();
            
            if (payment.getStatus() != Payment.PaymentStatus.PENDING) {
                return createErrorResponse("Payment is not in pending state: " + payment.getStatus());
            }
            
            if (success) {
                // 3D Secure başarılı
                payment.setStatus(Payment.PaymentStatus.COMPLETED);
                payment.setCompletedAt(LocalDateTime.now());
                payment.setGatewayResponse("3D Secure authentication successful");
                if (bankTransactionId != null) {
                    payment.setGatewayTransactionId(bankTransactionId);
                }
                
                log.info("3D Secure payment completed successfully: {}", paymentId);
                
                // Audit log - 3D Secure success
                auditService.logEvent(
                    auditService.createEvent()
                        .eventType("3D_SECURE")
                        .action("AUTHENTICATION_SUCCESS")
                        .actor("bank-system")
                        .resourceType("Payment")
                        .resourceId(paymentId)
                        .additionalData("transactionId", payment.getTransactionId())
                        .additionalData("bankTransactionId", bankTransactionId)
                        .additionalData("amount", payment.getAmount())
                        .complianceTag("PCI_DSS")
                        .complianceTag("3DS")
                );
                
            } else {
                // 3D Secure başarısız
                payment.setStatus(Payment.PaymentStatus.FAILED);
                payment.setGatewayResponse("3D Secure authentication failed");
                
                log.info("3D Secure payment failed: {}", paymentId);
                
                // Audit log - 3D Secure failure
                auditService.logEvent(
                    auditService.createEvent()
                        .eventType("3D_SECURE")
                        .action("AUTHENTICATION_FAILURE")
                        .actor("bank-system")
                        .resourceType("Payment")
                        .resourceId(paymentId)
                        .additionalData("transactionId", payment.getTransactionId())
                        .additionalData("failureReason", "3D Secure authentication failed")
                        .complianceTag("PCI_DSS")
                        .complianceTag("3DS")
                );
            }
            
            payment = paymentRepository.save(payment);
            
            return createPaymentResponse(payment, 
                success ? "3D Secure payment completed successfully" : "3D Secure payment failed", 
                success);
                
        } catch (Exception e) {
            log.error("Error completing 3D Secure payment: {}", paymentId, e);
            return createErrorResponse("Error completing 3D Secure payment: " + e.getMessage());
        }
    }
    
    private String generateTransactionId() {
        return "TXN-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
    
    private String generatePaymentId() {
        return "PAY-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
  
    private Payment.PaymentStatus processPaymentThroughGateway(PaymentRequest request, Payment payment) {
        log.info("Processing payment through gateway for payment: {}", payment.getPaymentId());
        
        try {
            // Banka entegrasyonu - gerçek banka API'sine istek at
            Payment.PaymentStatus bankResponse = processPaymentWithBank(request, payment);
            
            if (bankResponse == Payment.PaymentStatus.PROCESSING) {
                payment.setGatewayResponse("Payment request sent to bank - processing");
                payment.setGatewayTransactionId("GTW-" + UUID.randomUUID().toString().substring(0, 8));
            } else if (bankResponse == Payment.PaymentStatus.FAILED) {
                payment.setGatewayResponse("Bank rejected payment request");
                payment.setGatewayTransactionId("GTW-" + UUID.randomUUID().toString().substring(0, 8));
            }
            
            return bankResponse;
            
        } catch (Exception e) {
            log.error("Error processing payment through gateway: {}", e.getMessage());
            payment.setGatewayResponse("Gateway error: " + e.getMessage());
            return Payment.PaymentStatus.FAILED;
        }
    }
    
    /**
     * Banka'ya payment isteği gönder
     */
    private Payment.PaymentStatus processPaymentWithBank(PaymentRequest request, Payment payment) {
        try {
            // Payment bilgilerini al (hangi banka ile yapıldığını öğrenmek için)
            String bankType = determineBankType(payment.getTransactionId());
            
            switch (bankType) {
                case "GARANTI":
                    return processPaymentWithGaranti(request, payment);
                case "ISBANK":
                    return processPaymentWithIsBank(request, payment);
                case "AKBANK":
                    return processPaymentWithAkbank(request, payment);
                default:
                    log.error("Unknown bank type for transaction: {}", payment.getTransactionId());
                    return Payment.PaymentStatus.FAILED;
            }
            
        } catch (Exception e) {
            log.error("Error determining bank type: {}", e.getMessage());
            return Payment.PaymentStatus.FAILED;
        }
    }
    
    /**
     * Transaction ID'den banka tipini belirle
     */
    private String determineBankType(String transactionId) {
        // Transaction ID formatına göre banka belirleme
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
     * Garanti BBVA'ya payment isteği gönder
     */
    private Payment.PaymentStatus processPaymentWithGaranti(PaymentRequest request, Payment payment) {
        try {
            log.info("Sending payment request to Garanti BBVA for amount: {}", payment.getAmount());
            
            // Garanti BBVA API'sine payment isteği
            String garantiResponse = sendPaymentRequestToGaranti(request, payment);
            
            if (garantiResponse.contains("SUCCESS")) {
                log.info("Garanti BBVA payment request successful");
                return Payment.PaymentStatus.PROCESSING;
            } else {
                log.error("Garanti BBVA payment request failed: {}", garantiResponse);
                return Payment.PaymentStatus.FAILED;
            }
            
        } catch (Exception e) {
            log.error("Error processing payment with Garanti BBVA: {}", e.getMessage());
            return Payment.PaymentStatus.FAILED;
        }
    }
    
    /**
     * İş Bankası'na payment isteği gönder
     */
    private Payment.PaymentStatus processPaymentWithIsBank(PaymentRequest request, Payment payment) {
        try {
            log.info("Sending payment request to İş Bankası for amount: {}", payment.getAmount());
            
            // İş Bankası API'sine payment isteği
            String isbankResponse = sendPaymentRequestToIsBank(request, payment);
            
            if (isbankResponse.contains("SUCCESS")) {
                payment.setGatewayResponse("İş Bankası payment request successful");
                return Payment.PaymentStatus.PROCESSING;
            } else {
                log.error("İş Bankası payment request failed: {}", isbankResponse);
                return Payment.PaymentStatus.FAILED;
            }
            
        } catch (Exception e) {
            log.error("Error processing payment with İş Bankası: {}", e.getMessage());
            return Payment.PaymentStatus.FAILED;
        }
    }
    
    /**
     * Akbank'a payment isteği gönder
     */
    private Payment.PaymentStatus processPaymentWithAkbank(PaymentRequest request, Payment payment) {
        try {
            log.info("Sending payment request to Akbank for amount: {}", payment.getAmount());
            
            // Akbank API'sine payment isteği
            String akbankResponse = sendPaymentRequestToAkbank(request, payment);
            
            if (akbankResponse.contains("SUCCESS")) {
                log.info("Akbank payment request successful");
                return Payment.PaymentStatus.PROCESSING;
            } else {
                log.error("Akbank payment request failed: {}", akbankResponse);
                return Payment.PaymentStatus.FAILED;
            }
            
        } catch (Exception e) {
            log.error("Error processing payment with Akbank: {}", e.getMessage());
            return Payment.PaymentStatus.FAILED;
        }
    }
    
    /**
     * Garanti BBVA API'sine payment isteği gönder (simulated)
     */
    private String sendPaymentRequestToGaranti(PaymentRequest request, Payment payment) {
        // Simulated Garanti BBVA API call
        try {
            Thread.sleep(200); // Simulate API call delay
            
            // Simulate success - çok yüksek limitler koyalım ki hep SUCCESS dönsün
            if (payment.getAmount().compareTo(java.math.BigDecimal.valueOf(100000)) > 0) {
                return "FAILED: Amount exceeds limit";
            } else {
                return "SUCCESS: Payment request accepted - processing";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "FAILED: Request interrupted";
        }
    }
    
    /**
     * İş Bankası API'sine payment isteği gönder (simulated)
     */
    private String sendPaymentRequestToIsBank(PaymentRequest request, Payment payment) {
        // Simulated İş Bankası API call
        try {
            Thread.sleep(150); // Simulate API call delay
            
            if (payment.getAmount().compareTo(java.math.BigDecimal.valueOf(100000)) > 0) {
                return "FAILED: Amount exceeds limit";
            } else {
                return "SUCCESS: Payment request accepted - processing";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "FAILED: Request interrupted";
        }
    }
    
    /**
     * Akbank API'sine payment isteği gönder (simulated)
     */
    private String sendPaymentRequestToAkbank(PaymentRequest request, Payment payment) {
        // Simulated Akbank API call
        try {
            Thread.sleep(180); // Simulate API call delay
            
            if (payment.getAmount().compareTo(java.math.BigDecimal.valueOf(100000)) > 0) {
                return "FAILED: Amount exceeds limit";
            } else {
                return "SUCCESS: Payment request accepted - processing";
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return "FAILED: Request interrupted";
        }
    }
    
    /**
     * Banka webhook callback'i geldiğinde payment status'u güncelle
     */
    public PaymentResponse handleBankWebhook(String transactionId, String bankTransactionId, 
                                          String authCode, String amount, String currency, boolean success) {
        log.info("🏦 Bank webhook received for transaction: {} - Success: {}", transactionId, success);
        
        try {
            // Transaction ID ile payment'i bul
            Payment payment = paymentRepository.findByTransactionId(transactionId)
                .orElseThrow(() -> new RuntimeException("Payment not found for transaction: " + transactionId));
            
            if (success) {
                // Başarılı ödeme
                payment.setStatus(Payment.PaymentStatus.COMPLETED);
                payment.setGatewayResponse("Payment completed via bank webhook");
                payment.setGatewayTransactionId(bankTransactionId);
                payment.setCompletedAt(LocalDateTime.now());
                
                log.info("✅ Payment {} completed via bank webhook", payment.getPaymentId());
                
                // Merchant'a başarı webhook'u gönder
                sendPaymentSuccessWebhook(payment);
                
            } else {
                // Başarısız ödeme
                payment.setStatus(Payment.PaymentStatus.FAILED);
                payment.setGatewayResponse("Payment failed via bank webhook");
                payment.setGatewayTransactionId(bankTransactionId);
                
                log.warn("❌ Payment {} failed via bank webhook", payment.getPaymentId());
                
                // Merchant'a başarısızlık webhook'u gönder
                sendPaymentFailureWebhook(payment);
            }
            
            // Payment'i kaydet
            log.info("💾 Saving payment to database - ID: {}, Status: {}", payment.getPaymentId(), payment.getStatus());
            try {
                payment = paymentRepository.save(payment);
                log.info("✅ Payment saved successfully - ID: {}, Final Status: {}", payment.getPaymentId(), payment.getStatus());
            } catch (Exception e) {
                log.error("❌ Error saving payment to database: {}", e.getMessage(), e);
                throw e;
            }
            
            // Audit log
            auditService.logEvent(
                auditService.createEvent()
                    .eventType("PAYMENT")
                    .action(success ? "BANK_WEBHOOK_SUCCESS" : "BANK_WEBHOOK_FAILURE")
                    .actor("bank")
                    .resourceType("Payment")
                    .resourceId(payment.getPaymentId())
                    .additionalData("transactionId", transactionId)
                    .additionalData("bankTransactionId", bankTransactionId)
                    .additionalData("authCode", authCode)
                    .additionalData("amount", amount)
                    .additionalData("currency", currency)
                    .complianceTag("PCI_DSS")
                    .complianceTag("KVKK")
            );
            
            return createPaymentResponse(payment, 
                success ? "Payment completed via bank webhook" : "Payment failed via bank webhook", 
                success);
                
        } catch (Exception e) {
            log.error("Error handling bank webhook for transaction: {}", transactionId, e);
            throw new RuntimeException("Failed to process bank webhook: " + e.getMessage());
        }
    }
    
    /**
     * Merchant'a başarılı payment webhook'u gönder
     */
    private void sendPaymentSuccessWebhook(Payment payment) {
        try {
            log.info("Sending success webhook to merchant for payment: {}", payment.getPaymentId());
            // TODO: Implement merchant webhook notification
            // Bu kısımda merchant'ın webhook URL'ine POST isteği gönderilir
            // Şimdilik sadece log yazıyoruz
        } catch (Exception e) {
            log.error("Error sending success webhook to merchant for payment: {}", payment.getPaymentId(), e);
        }
    }
    
    /**
     * Merchant'a başarısız payment webhook'u gönder
     */
    private void sendPaymentFailureWebhook(Payment payment) {
        try {
            log.info("Sending failure webhook to merchant for payment: {}", payment.getPaymentId());
            // TODO: Implement merchant webhook notification
            // Bu kısımda merchant'ın webhook URL'ine POST isteği gönderilir
            // Şimdilik sadece log yazıyoruz
        } catch (Exception e) {
            log.error("Error sending failure webhook to merchant for payment: {}", payment.getPaymentId(), e);
        }
    }
    
    /**
     * Banka'dan gelen payment webhook'ını işle
     */
    public void processBankPaymentWebhook(String bankType, String webhookData) {
        try {
            log.info("Processing {} payment webhook: {}", bankType, webhookData);
            
            // Webhook data'sını parse et (gerçek implementasyonda JSON parsing yapılır)
            // Bu örnekte basit string parsing kullanıyoruz
            String[] parts = webhookData.split("\\|");
            if (parts.length >= 3) {
                String paymentId = parts[0];
                String status = parts[1];
                String message = parts[2];
                
                log.info("Parsed webhook data - PaymentId: {}, Status: {}, Message: {}", paymentId, status, message);
                
                // Payment ID ile payment'ı bul
                Optional<Payment> paymentOpt = paymentRepository.findByPaymentId(paymentId);
                if (paymentOpt.isPresent()) {
                    Payment payment = paymentOpt.get();
                    
                    log.info("Found payment: {} with current status: {}", payment.getPaymentId(), payment.getStatus());
                    
                    // Banka'dan gelen status'a göre güncelle
                    Payment.PaymentStatus newStatus = mapBankStatusToPaymentStatus(status);
                    Payment.PaymentStatus oldStatus = payment.getStatus();
                    
                    log.info("Updating payment status from {} to {} via {} webhook", oldStatus, newStatus, bankType);
                    
                    payment.setStatus(newStatus);
                    payment.setGatewayResponse(bankType + " webhook: " + message);
                    payment.setUpdatedAt(LocalDateTime.now());
                    
                    // Eğer payment tamamlandıysa tarih ekle
                    if (newStatus == Payment.PaymentStatus.COMPLETED) {
                        payment.setCompletedAt(LocalDateTime.now());
                        log.info("Payment {} completed at: {}", payment.getPaymentId(), payment.getCompletedAt());
                    }
                    
                    paymentRepository.save(payment);
                    log.info("Payment {} status updated successfully in database", payment.getPaymentId());
                    
                    // Audit logging
                    auditService.logEvent(
                        auditService.createEvent()
                            .eventType("PAYMENT_STATUS_UPDATED_VIA_WEBHOOK")
                            .severity(AuditLog.Severity.MEDIUM)
                            .actor(bankType)
                            .action("UPDATE")
                            .resourceType("PAYMENT")
                            .resourceId(payment.getPaymentId())
                            .additionalData("bankType", bankType)
                            .additionalData("oldStatus", oldStatus.toString())
                            .additionalData("newStatus", newStatus.toString())
                            .additionalData("webhookMessage", message)
                            .complianceTag("PCI_DSS")
                    );
                    
                    log.info("Payment status updated via {} webhook from {} to {} for payment ID: {}", 
                            bankType, oldStatus, newStatus, payment.getPaymentId());
                    
                    // Merchant'a webhook gönder (payment durumu değişti)
                    if (newStatus == Payment.PaymentStatus.COMPLETED) {
                        sendPaymentSuccessWebhook(payment);
                    } else if (newStatus == Payment.PaymentStatus.FAILED) {
                        sendPaymentFailureWebhook(payment);
                    }
                    
                } else {
                    log.warn("Payment not found for payment ID: {}", paymentId);
                }
            } else {
                log.error("Invalid webhook data format: {} (expected: paymentId|status|message)", webhookData);
            }
            
        } catch (Exception e) {
            log.error("Error processing {} payment webhook: {}", bankType, e.getMessage());
            throw new RuntimeException("Failed to process payment webhook", e);
        }
    }
    
    /**
     * Banka status'unu payment status'una map et
     */
    private Payment.PaymentStatus mapBankStatusToPaymentStatus(String bankStatus) {
        switch (bankStatus.toUpperCase()) {
            case "SUCCESS":
            case "COMPLETED":
                return Payment.PaymentStatus.COMPLETED;
            case "FAILED":
            case "REJECTED":
                return Payment.PaymentStatus.FAILED;
            case "PROCESSING":
            case "PENDING":
                return Payment.PaymentStatus.PROCESSING;
            case "CANCELLED":
                return Payment.PaymentStatus.CANCELLED;
            default:
                log.warn("Unknown bank status: {}, defaulting to PROCESSING", bankStatus);
                return Payment.PaymentStatus.PROCESSING;
        }
    }
    

    
    private PaymentResponse createPaymentResponse(Payment payment, String message, boolean success) {
        PaymentResponse response = new PaymentResponse();
        response.setId(payment.getId());
        response.setPaymentId(payment.getPaymentId());
        response.setTransactionId(payment.getTransactionId());
        response.setMerchantId(payment.getMerchantId());
        response.setCustomerId(payment.getCustomerId());
        response.setAmount(payment.getAmount());
        response.setCurrency(payment.getCurrency());
        response.setStatus(payment.getStatus());
        response.setPaymentMethod(payment.getPaymentMethod());
        response.setCardNumber(payment.getCardNumber());
        response.setCardHolderName(payment.getCardHolderName());
        response.setCardBrand(payment.getCardBrand());
        response.setCardBin(payment.getCardBin());
        response.setCardLastFour(payment.getCardLastFour());
        response.setDescription(payment.getDescription());
        response.setGatewayResponse(payment.getGatewayResponse());
        response.setGatewayTransactionId(payment.getGatewayTransactionId());
        response.setCreatedAt(payment.getCreatedAt());
        response.setUpdatedAt(payment.getUpdatedAt());
        response.setCompletedAt(payment.getCompletedAt());
        response.setMessage(message);
        response.setSuccess(success);
        return response;
    }
    
    private PaymentResponse createErrorResponse(String errorMessage) {
        PaymentResponse response = new PaymentResponse();
        response.setMessage(errorMessage);
        response.setSuccess(false);
        return response;
    }
}