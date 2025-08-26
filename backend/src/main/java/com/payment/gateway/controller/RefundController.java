package com.payment.gateway.controller;

import com.payment.gateway.dto.RefundRequest;
import com.payment.gateway.dto.RefundResponse;
import com.payment.gateway.model.Refund;
import com.payment.gateway.service.RefundService;
import com.payment.gateway.service.MerchantAuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/v1/refunds")
@RequiredArgsConstructor
@Slf4j
public class RefundController {
    
    private final RefundService refundService;
    private final MerchantAuthService merchantAuthService;
    
    // POST - Create new refund
    @PostMapping
    public ResponseEntity<RefundResponse> createRefund(
            @Valid @RequestBody RefundRequest request,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Creating new refund for payment: {}, transaction: {}", 
                request.getPaymentId(), request.getTransactionId());

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refund create denemesi");
            RefundResponse errorResponse = new RefundResponse();
            errorResponse.setSuccess(false);
            errorResponse.setMessage("Geçersiz API key. Lütfen doğru API key kullanın.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorResponse);
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            RefundResponse errorResponse = new RefundResponse();
            errorResponse.setSuccess(false);
            errorResponse.setMessage("Merchant bilgisi alınamadı.");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(errorResponse);
        }
        
        RefundResponse response = refundService.createRefundForMerchant(request, merchantId);
        
        if (response.isSuccess()) {
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    // PUT - Complete/Approve a refund manually (for admin dashboard)
    @PutMapping("/{refundId}/complete")
    public ResponseEntity<RefundResponse> completeRefund(@PathVariable String refundId) {
        log.info("Manually completing refund: {}", refundId);
        
        RefundResponse response = refundService.completeRefund(refundId);
        
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    // PUT - Cancel/Reject a refund manually
    @PutMapping("/{refundId}/cancel")
    public ResponseEntity<RefundResponse> cancelRefund(@PathVariable String refundId) {
        log.info("Manually cancelling refund: {}", refundId);
        
        RefundResponse response = refundService.cancelRefund(refundId);
        
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }
    

    
    // GET - Get refund by ID
    @GetMapping("/{id}")
    public ResponseEntity<RefundResponse> getRefundById(
            @PathVariable Long id,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving refund with ID: {}", id);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refund get denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        
        RefundResponse response = refundService.getRefundByIdForMerchant(id, merchantId);
        
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    // GET - Get refund by refund ID
    @GetMapping("/refund-id/{refundId}")
    public ResponseEntity<RefundResponse> getRefundByRefundId(
            @PathVariable String refundId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving refund with refund ID: {}", refundId);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refund get by refundId denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        RefundResponse response = refundService.getRefundByRefundIdForMerchant(refundId, merchantId);
        
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    // GET - Get refund by payment ID
    @GetMapping("/payment/{paymentId}")
    public ResponseEntity<RefundResponse> getRefundByPaymentId(
            @PathVariable String paymentId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving refund with payment ID: {}", paymentId);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refund get by paymentId denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        RefundResponse response = refundService.getRefundByPaymentIdForMerchant(paymentId, merchantId);
        
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    // GET - Get all refunds for merchant
    @GetMapping
    public ResponseEntity<List<RefundResponse>> getAllRefunds(
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving all refunds for merchant");

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refunds list denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        
        List<RefundResponse> refunds = refundService.getRefundsByMerchantId(merchantId);
        return ResponseEntity.ok(refunds);
    }
    

    
    // GET - Get refunds by merchant ID
    @GetMapping("/merchant/{merchantId}")
    public ResponseEntity<List<RefundResponse>> getRefundsByMerchantId(
            @PathVariable String merchantId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving refunds for merchant: {}", merchantId);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refunds by merchantId denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al ve doğrula
        String requestingMerchantId = getMerchantIdFromApiKey(apiKey);
        if (requestingMerchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Sadece kendi merchant ID'sini görebilir
        if (!requestingMerchantId.equals(merchantId)) {
            log.warn("🚫 Merchant {} başka merchant'ın ({}) refundlarını görmeye çalıştı", requestingMerchantId, merchantId);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        List<RefundResponse> refunds = refundService.getRefundsByMerchantId(merchantId);
        return ResponseEntity.ok(refunds);
    }
    
    // GET - Get refunds by customer ID
    @GetMapping("/customer/{customerId}")
    public ResponseEntity<List<RefundResponse>> getRefundsByCustomerId(
            @PathVariable String customerId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving refunds for customer: {}", customerId);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refunds by customerId denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<RefundResponse> refunds = refundService.getRefundsByCustomerIdForMerchant(customerId, merchantId);
        return ResponseEntity.ok(refunds);
    }
    
    // GET - Get refunds by status
    @GetMapping("/status/{status}")
    public ResponseEntity<List<RefundResponse>> getRefundsByStatus(
            @PathVariable Refund.RefundStatus status,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving refunds with status: {}", status);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refunds by status denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<RefundResponse> refunds = refundService.getRefundsByStatusForMerchant(status, merchantId);
        return ResponseEntity.ok(refunds);
    }
    
    // GET - Get refunds by reason
    @GetMapping("/reason/{reason}")
    public ResponseEntity<List<RefundResponse>> getRefundsByReason(
            @PathVariable Refund.RefundReason reason,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving refunds with reason: {}", reason);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refunds by reason denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<RefundResponse> refunds = refundService.getRefundsByReasonForMerchant(reason, merchantId);
        return ResponseEntity.ok(refunds);
    }
    
    // GET - Get refunds by transaction ID
    @GetMapping("/transaction/{transactionId}")
    public ResponseEntity<List<RefundResponse>> getRefundsByTransactionId(
            @PathVariable String transactionId,
            @RequestHeader(value = "X-API-Key", required = false) String apiKey) {
        log.info("Retrieving refunds for transaction: {}", transactionId);

        // API Key kontrolü
        if (!merchantAuthService.isValidApiKey(apiKey)) {
            log.warn("🚫 Geçersiz API key ile refunds by transactionId denemesi");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // Merchant ID'yi API key'den al
        String merchantId = getMerchantIdFromApiKey(apiKey);
        if (merchantId == null) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        List<RefundResponse> refunds = refundService.getRefundsByTransactionIdForMerchant(transactionId, merchantId);
        return ResponseEntity.ok(refunds);
    }
    
    // POST - Update refund
    @PostMapping("/{id}/update")
    public ResponseEntity<RefundResponse> updateRefund(@PathVariable Long id, @Valid @RequestBody RefundRequest request) {
        log.info("Updating refund with ID: {}", id);
        
        RefundResponse response = refundService.updateRefund(id, request);
        
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    // PUT - Update refund status
    @PutMapping("/{id}/status")
    public ResponseEntity<RefundResponse> updateRefundStatus(
            @PathVariable Long id, 
            @RequestParam Refund.RefundStatus status) {
        log.info("Updating refund status to {} for ID: {}", status, id);
        
        RefundResponse response = refundService.updateRefundStatus(id, status);
        
        if (response.isSuccess()) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.badRequest().body(response);
        }
    }
    
    // POST - Bank webhook for refund status updates
    @PostMapping("/webhooks/garanti")
    public ResponseEntity<String> handleGarantiRefundWebhook(@RequestBody String webhookData) {
        log.info("Received Garanti BBVA refund webhook: {}", webhookData);
        
        try {
            // Process Garanti BBVA refund webhook
            refundService.processBankRefundWebhook("GARANTI", webhookData);
            return ResponseEntity.ok("Webhook processed successfully");
        } catch (Exception e) {
            log.error("Error processing Garanti BBVA refund webhook: {}", e.getMessage());
            return ResponseEntity.badRequest().body("Webhook processing failed");
        }
    }
    
    @PostMapping("/webhooks/isbank")
    public ResponseEntity<String> handleIsBankRefundWebhook(@RequestBody String webhookData) {
        log.info("Received İş Bankası refund webhook: {}", webhookData);
        
        try {
            // Process İş Bankası refund webhook
            refundService.processBankRefundWebhook("ISBANK", webhookData);
            return ResponseEntity.ok("Webhook processed successfully");
        } catch (Exception e) {
            log.error("Error processing İş Bankası refund webhook: {}", e.getMessage());
            return ResponseEntity.badRequest().body("Webhook processing failed");
        }
    }
    
    @PostMapping("/webhooks/akbank")
    public ResponseEntity<String> handleAkbankRefundWebhook(@RequestBody String webhookData) {
        log.info("Received Akbank refund webhook: {}", webhookData);
        
        try {
            // Process Akbank refund webhook
            refundService.processBankRefundWebhook("AKBANK", webhookData);
            return ResponseEntity.ok("Webhook processed successfully");
        } catch (Exception e) {
            log.error("Error processing Akbank refund webhook: {}", e.getMessage());
            return ResponseEntity.badRequest().body("Webhook processing failed");
        }
    }
    
    /**
     * Banka'dan gelen refund webhook'ını simüle et (test için)
     */
    @PostMapping("/{refundId}/simulate-bank-webhook")
    public ResponseEntity<Map<String, Object>> simulateBankWebhook(
            @PathVariable String refundId,
            @RequestParam(defaultValue = "SUCCESS") String status,
            @RequestParam(defaultValue = "GARANTI") String bankType) {
        
        log.info("🏦 Simulating bank webhook for refund: {} - Status: {} - Bank: {}", refundId, status, bankType);
        
        try {
            // Webhook data formatı: refundId|status|message
            String webhookData = refundId + "|" + status + "|" + bankType + " refund processed successfully";
            
            // RefundService'deki webhook processing metodunu çağır
            refundService.processBankRefundWebhook(bankType, webhookData);
            
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("message", "Bank webhook simulated successfully");
            result.put("refundId", refundId);
            result.put("status", status);
            result.put("bankType", bankType);
            result.put("webhookData", webhookData);
            
            return ResponseEntity.ok(result);
            
        } catch (Exception e) {
            log.error("Error simulating bank webhook for refund: {}", refundId, e);
            
            Map<String, Object> errorResult = new HashMap<>();
            errorResult.put("success", false);
            errorResult.put("message", "Failed to simulate bank webhook: " + e.getMessage());
            
            return ResponseEntity.badRequest().body(errorResult);
        }
    }

    /**
     * API key'den merchant ID'yi çıkart
     */
    private String getMerchantIdFromApiKey(String apiKey) {
        if (apiKey == null) {
            return null;
        }
        
        // Test mode - her test API key'ini farklı merchant'a eşle
        if (apiKey.startsWith("pk_test_") || apiKey.equals("pk_merch001_live_abc123")) {
            switch (apiKey) {
                case "pk_test_merchant1":
                    return "TEST_MERCHANT";
                case "pk_test_merchant2":
                    return "TEST_MERCHANT_2";
                case "pk_test_merchant3":
                    return "TEST_MERCHANT_3";
                case "pk_merch001_live_abc123":
                    return "TEST_MERCHANT"; // Bu API key için TEST_MERCHANT döndür
                default:
                    return "TEST_MERCHANT"; // Default test merchant
            }
        }
        
        // Production'da merchant'ı API key ile bulup merchant ID'yi döneriz
        return merchantAuthService.getMerchantByApiKey(apiKey)
                .map(merchant -> merchant.getMerchantId())
                .orElse(null);
    }
}