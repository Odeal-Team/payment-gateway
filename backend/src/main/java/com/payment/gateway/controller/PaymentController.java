package com.payment.gateway.controller;

import com.payment.gateway.dto.PaymentRequest;
import com.payment.gateway.dto.PaymentResponse;
import com.payment.gateway.model.Payment;
import com.payment.gateway.service.PaymentService;
import com.payment.gateway.service.MerchantAuthService;
import com.payment.gateway.repository.PaymentRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Optional;

@RestController
@RequestMapping("/v1/payments")
@RequiredArgsConstructor
@Slf4j
public class PaymentController {

    private final PaymentService paymentService;
    private final MerchantAuthService merchantAuthService;
    private final PaymentRepository paymentRepository;

    // POST - Create new payment
    @PostMapping
    public ResponseEntity<PaymentResponse> createPayment(
            @Valid @RequestBody PaymentRequest request,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey,
            HttpServletRequest httpRequest) {

        log.info("🔐 Payment request - Merchant: {}, API Key: {}",
                request.getMerchantId(), apiKey != null ? "***" + apiKey.substring(Math.max(0, apiKey.length() - 4)) : "missing");

        // 1. API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile ödeme denemesi");
            PaymentResponse errorResponse = new PaymentResponse();
            errorResponse.setSuccess(false);
            errorResponse.setMessage("Geçersiz API key. Lütfen doğru API key kullanın.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorResponse);
        }

        // 2. API Key ve Merchant ID eşleşmesi kontrolü
        if (!merchantAuthService.validateMerchantAccess(apiKey, request.getMerchantId())) {
            log.warn("🚫 API key ve merchant ID uyumsuzluğu - API: {}, Merchant: {}",
                    apiKey, request.getMerchantId());
            PaymentResponse errorResponse = new PaymentResponse();
            errorResponse.setSuccess(false);
            errorResponse.setMessage("API key bu merchant için geçerli değil.");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(errorResponse);
        }

        log.info("✅ Merchant authentication başarılı - Processing payment for: {}",
                request.getMerchantId());

        // 3. IP address ve User Agent bilgilerini al (fraud detection için)
        String ipAddress = getClientIpAddress(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");

        log.debug("Client info - IP: {}, User-Agent: {}", ipAddress, userAgent);

        // 4. Ödeme işlemini gerçekleştir (fraud detection ile)
        PaymentResponse response = paymentService.createPayment(request, ipAddress, userAgent);

        if (response.isSuccess()) {
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }
    // GET - Get payment by transaction ID
    @GetMapping("/transaction/{transactionId}")
    public ResponseEntity<PaymentResponse> getPaymentByTransactionId(
            @PathVariable String transactionId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving payment with transaction ID: {}", transactionId);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile payment get denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        PaymentResponse response = paymentService.getPaymentByTransactionIdForMerchant(transactionId, merchantId);

        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    // GET - Get payment by payment ID
    @GetMapping("/payment/{paymentId}")
    public ResponseEntity<PaymentResponse> getPaymentByPaymentId(
            @PathVariable String paymentId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving payment with payment ID: {}", paymentId);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile payment get denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        
        PaymentResponse response = paymentService.getPaymentByPaymentIdForMerchant(paymentId, merchantId);
        
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    // GET - Get all payments for merchant
    @GetMapping
    public ResponseEntity<List<PaymentResponse>> getAllPayments(
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving all payments for merchant");

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile payments list denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<PaymentResponse> payments = paymentService.getPaymentsByMerchantId(merchantId);
        return ResponseEntity.ok(payments);
    }

    // GET - Get payments by merchant ID (for admin use, requires merchant authentication)
    @GetMapping("/merchant/{merchantId}")
    public ResponseEntity<List<PaymentResponse>> getPaymentsByMerchantId(
            @PathVariable String merchantId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving payments for merchant: {}", merchantId);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile merchant payments denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant sadece kendi payment'larını görebilir
        String requestingMerchantId = getMerchantIdFromApiKey(apiKey);
        if (requestingMerchantId == null || !requestingMerchantId.equals(merchantId)) {
            log.warn("🚫 Merchant {} tried to access payments of {}", requestingMerchantId, merchantId);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        List<PaymentResponse> payments = paymentService.getPaymentsByMerchantId(merchantId);
        return ResponseEntity.ok(payments);
    }

    // GET - Get payments by customer ID (merchant-restricted)
    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<PaymentResponse>> getPaymentsByCustomerId(
            @PathVariable String customerId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving payments for customer: {}", customerId);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile customer payments denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Sadece bu merchant'ın customerlarına ait payment'ları döndür
        List<PaymentResponse> payments = paymentService.getPaymentsByCustomerIdForMerchant(customerId, merchantId);
        return ResponseEntity.ok(payments);
    }

    // GET - Get payments by status
    @GetMapping("/status/{status}")
    public ResponseEntity<List<PaymentResponse>> getPaymentsByStatus(@PathVariable Payment.PaymentStatus status) {
        log.info("Retrieving payments with status: {}", status);

        List<PaymentResponse> payments = paymentService.getPaymentsByStatus(status);
        return ResponseEntity.ok(payments);
    }
    // DELETE - Delete payment
    @DeleteMapping("/{id}")
    public ResponseEntity<PaymentResponse> deletePayment(@PathVariable Long id) {
        log.info("Deleting payment with ID: {}", id);

        PaymentResponse response = paymentService.deletePayment(id);

        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }
    // ===== BANK WEBHOOK ENDPOINTS =====

    /**
     * Banka webhook callback'i - Ödeme sonucu geldiğinde
     */
   /*  @PostMapping("/bank-webhook")
    public ResponseEntity<Map<String, String>> handleBankWebhook(@RequestBody Map<String, Object> webhookData) {
        log.info("🏦 Bank webhook received: {}", webhookData);
        
        try {
            // Webhook verilerini parse et
            String transactionId = (String) webhookData.get("transactionId");
            String bankTransactionId = (String) webhookData.get("bankTransactionId");
            String authCode = (String) webhookData.get("authCode");
            String amount = (String) webhookData.get("amount");
            String currency = (String) webhookData.get("currency");
            Boolean success = (Boolean) webhookData.get("success");
            
            if (transactionId == null || success == null) {
                log.error("❌ Invalid webhook data - missing required fields");
                return ResponseEntity.badRequest().body(Map.of("error", "Missing required fields"));
            }
            
            // Payment status'u güncelle
            PaymentResponse response = paymentService.handleBankWebhook(
                transactionId, bankTransactionId, authCode, amount, currency, success);
            
            log.info("✅ Bank webhook processed successfully for transaction: {}", transactionId);
            
            return ResponseEntity.ok(Map.of(
                "status", "success",
                "message", "Webhook processed successfully",
                "paymentId", response.getPaymentId(),
                "finalStatus", response.getStatus().name()
            ));
            
        } catch (Exception e) {
            log.error("❌ Error processing bank webhook", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Failed to process webhook: " + e.getMessage()));
        }
    }
    */
    /**
     * Banka'dan gelen payment webhook'ını simüle et (test için)
     */
    @PostMapping("/{transactionId}/simulate-bank-webhook")
    public ResponseEntity<Map<String, Object>> simulateBankWebhook(
            @PathVariable String transactionId,
            @RequestParam(defaultValue = "SUCCESS") String status,
            @RequestParam(defaultValue = "GARANTI") String bankType) {
        
        log.info("🏦 Simulating bank webhook for payment with transactionId: {} - Status: {} - Bank: {}", transactionId, status, bankType);
        
        try {
            // Payment'ı transactionId ile bul
            Optional<Payment> paymentOpt = paymentRepository.findByTransactionId(transactionId);
            if (!paymentOpt.isPresent()) {
                Map<String, Object> errorResult = new HashMap<>();
                errorResult.put("success", false);
                errorResult.put("message", "Payment not found with transactionId: " + transactionId);
                return ResponseEntity.badRequest().body(errorResult);
            }
            
            Payment payment = paymentOpt.get();
            
            // Webhook data formatı: paymentId|status|message (paymentId kullan, transactionId değil!)
            String webhookData = payment.getPaymentId() + "|" + status + "|" + bankType + " payment processed successfully";
            
            log.info("Processing webhook for payment: {} with data: {}", payment.getPaymentId(), webhookData);
            
            // PaymentService'deki webhook processing metodunu çağır
            paymentService.processBankPaymentWebhook(bankType, webhookData);
            
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("message", "Bank webhook simulated successfully");
            result.put("transactionId", transactionId);
            result.put("paymentId", payment.getPaymentId());
            result.put("status", status);
            result.put("bankType", bankType);
            result.put("webhookData", webhookData);
            result.put("oldStatus", payment.getStatus());
            result.put("newStatus", status);
            
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            log.error("Error simulating bank webhook for payment with transactionId: {}", transactionId, e);
            
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("message", "Failed to simulate bank webhook: " + e.getMessage());
            
            return ResponseEntity.badRequest().body(errorResult);
        }
    }
    
    /**
     * Extract client IP address from HTTP request
     * Handles proxy headers like X-Forwarded-For, X-Real-IP
     */
    private String getClientIpAddress(HttpServletRequest request) {
        String[] headerNames = {
                "X-Forwarded-For",
                "X-Real-IP",
                "Proxy-Client-IP",
                "WL-Proxy-Client-IP",
                "HTTP_X_FORWARDED_FOR",
                "HTTP_X_FORWARDED",
                "HTTP_X_CLUSTER_CLIENT_IP",
                "HTTP_CLIENT_IP",
                "HTTP_FORWARDED_FOR",
                "HTTP_FORWARDED",
                "HTTP_VIA",
                "REMOTE_ADDR"
        };

        for (String header : headerNames) {
            String ip = request.getHeader(header);
            if (ip != null && !ip.isEmpty() && !"unknown".equalsIgnoreCase(ip)) {
                // X-Forwarded-For can contain multiple IPs, take the first one
                if (ip.contains(",")) {
                    ip = ip.split(",")[0].trim();
                }
                return ip;
            }
        }

        // Fallback to remote address
        String remoteAddr = request.getRemoteAddr();
        return remoteAddr != null ? remoteAddr : "unknown";
    }

    /**
     * API key'den merchant ID'yi çıkart
     */
    private String getMerchantIdFromApiKey(String apiKey) {
        if (apiKey == null) {
            return null;
        }
        
        // Production'da merchant'ı API key ile bulup merchant ID'yi döneriz
        return merchantAuthService.getMerchantByApiKey(apiKey)
                .map(merchant -> merchant.getMerchantId())
                .orElse(null);
    }
}