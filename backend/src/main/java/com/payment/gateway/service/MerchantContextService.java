package com.payment.gateway.service;

import com.payment.gateway.model.Merchant;
import com.payment.gateway.repository.MerchantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Optional;

/**
 * Merchant context'i yöneten servis
 * Multi-tenant yapı için merchant isolation sağlar
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MerchantContextService {
    
    private final MerchantRepository merchantRepository;
    
    private static final ThreadLocal<String> currentMerchantId = new ThreadLocal<>();
    
    /**
     * Mevcut request'ten merchant ID'yi çıkarır
     */
    public String getCurrentMerchantId() {
        String merchantId = currentMerchantId.get();
        if (merchantId != null) {
            return merchantId;
        }
        
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                
                // API Key header'dan merchant ID'yi çıkar
                String apiKey = request.getHeader("X-API-Key");
                if (apiKey != null) {
                    Optional<Merchant> merchant = merchantRepository.findByApiKey(apiKey);
                    if (merchant.isPresent()) {
                        String id = merchant.get().getMerchantId();
                        currentMerchantId.set(id);
                        return id;
                    }
                }
                
                // Authorization header'dan da kontrol et
                String authHeader = request.getHeader("Authorization");
                if (authHeader != null && authHeader.startsWith("Bearer ")) {
                    String token = authHeader.substring(7);
                    // Token'dan merchant ID çıkar (JWT veya custom token)
                    // Bu kısım authentication servisine göre değişebilir
                }
            }
        } catch (Exception e) {
            log.warn("Failed to extract merchant ID from request: {}", e.getMessage());
        }
        
        return null;
    }
    
    /**
     * Mevcut merchant'ı getir
     */
    public Optional<Merchant> getCurrentMerchant() {
        String merchantId = getCurrentMerchantId();
        if (merchantId != null) {
            return merchantRepository.findByMerchantId(merchantId);
        }
        return Optional.empty();
    }
    
    /**
     * Merchant ID'yi manuel olarak set et (test için)
     */
    public void setCurrentMerchantId(String merchantId) {
        currentMerchantId.set(merchantId);
    }
    
    /**
     * Thread local'ı temizle
     */
    public void clearCurrentMerchantId() {
        currentMerchantId.remove();
    }
    
    /**
     * Admin kullanıcı mı kontrol et
     */
    public boolean isAdminUser() {
        try {
            ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                
                // Admin API key kontrolü
                String apiKey = request.getHeader("X-API-Key");
                if (apiKey != null && apiKey.startsWith("pk_admin_")) {
                    return true;
                }
                
                // Admin token kontrolü
                String authHeader = request.getHeader("Authorization");
                if (authHeader != null && authHeader.startsWith("Bearer ")) {
                    String token = authHeader.substring(7);
                    // Admin token kontrolü
                    if (token.startsWith("admin_")) {
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Failed to check admin status: {}", e.getMessage());
        }
        
        return false;
    }
    
    /**
     * Merchant'a ait veri mi kontrol et
     */
    public boolean isMerchantData(String dataMerchantId) {
        if (isAdminUser()) {
            return true; // Admin tüm verileri görebilir
        }
        
        String currentMerchantId = getCurrentMerchantId();
        return currentMerchantId != null && currentMerchantId.equals(dataMerchantId);
    }
}