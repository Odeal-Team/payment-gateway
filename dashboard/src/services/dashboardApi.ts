import axios from 'axios';
import { 
  PaymentListItem, 
  PaymentDetail, 
  PaymentStats, 
  DashboardFilters,
  RefundFilters, 
  PaginationInfo,
  RefundListItem,
  RefundDetail,
  RefundStats,
  RefundStatus,
  RefundReason,
  DisputeStats,
  DisputeListItem,
  DisputeDetail,
  DisputeFilters,
  DisputeResponse,
  DisputeStatus,
  DisputeReason
} from '../types/dashboard';

const API_BASE_URL = 'http://localhost:8080';

// Create axios instance with interceptors
const dashboardApiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth headers
dashboardApiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  const apiKey = localStorage.getItem('auth_api_key');
      
  console.log('Dashboard API - Token:', token ? 'Present' : 'Missing');
  console.log('Dashboard API - API Key:', apiKey ? 'Present' : 'Missing');
  
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }
  
  return config;
});

// Utility function to get current merchant ID from localStorage
const getCurrentMerchantId = (): string => {
  try {
    const userStr = localStorage.getItem('auth_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.merchantId;
    }
    console.error('Merchant ID not found in localStorage (auth_user missing).');
    return '';
  } catch (error) {
    console.error('Error getting merchant ID:', error);
    return '';
  }
};

// Response interceptor for error handling
dashboardApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - redirect to login
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_api_key');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface PaymentListResponse {
  payments: PaymentListItem[];
  pagination: PaginationInfo;
  stats?: PaymentStats;
}

export const dashboardAPI = {
  // Get customer payments by customer ID
  getCustomerPayments: async (customerId: string): Promise<PaymentListItem[]> => {
    try {
      const merchantId = getCurrentMerchantId();
      console.log('📊 Getting customer payments for customer:', customerId, 'merchant:', merchantId);
      
      const response = await dashboardApiClient.get(`/v1/payments/customer/${customerId}`);
      let payments = response.data;
      
      // Ensure transactionId is properly mapped
      let mapped = payments.map((payment: any) => ({
        ...payment,
        transactionId: payment.transactionId || payment.transaction_id || payment.id || 'N/A'
      }));

      // Fallback: If backend returned empty (edge cases), fetch merchant payments and filter client-side
      if (!mapped || mapped.length === 0) {
        try {
          console.log('ℹ️ Fallback: fetching merchant payments to filter by customer');
          const merchRes = await dashboardApiClient.get(`/v1/payments/merchant/${merchantId}`);
          const all = merchRes.data || [];
          mapped = all
            .filter((p: any) => p.customerId === customerId)
            .map((payment: any) => ({
              ...payment,
              transactionId: payment.transactionId || payment.transaction_id || payment.id || 'N/A'
            }));
        } catch (e) {
          console.warn('Fallback merchant fetch failed', e);
        }
      }

      return mapped;
    } catch (error) {
      console.error('Get customer payments error:', error);
      return [];
    }
  },

  // Get all customers by extracting from payments data
  getCustomers: async (): Promise<any[]> => {
    try {
      const merchantId = getCurrentMerchantId();
      console.log('📊 Getting customers for merchant:', merchantId);
      
      // Get all payments for the merchant and extract unique customers
      const response = await dashboardApiClient.get(`/v1/payments/merchant/${merchantId}`);
      const payments = response.data;
      
      // Extract unique customers from payments
      const customerMap = new Map();
      payments.forEach((payment: any) => {
        if (payment.customerId) {
          if (!customerMap.has(payment.customerId)) {
            customerMap.set(payment.customerId, {
              id: Date.now() + Math.random(), // Unique ID
              customerId: payment.customerId,
              transactionId: payment.transactionId || 'N/A',
              customerName: payment.customerName || payment.cardHolderName || 'Unknown Customer',
              email: payment.customerEmail || 'no-email@example.com',
              phone: payment.customerPhone || 'N/A',
              description: `Customer from payment ${payment.paymentId}`,
              address: payment.customerAddress || 'N/A',
              status: 'ACTIVE',
              createdAt: payment.createdAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastPaymentAt: payment.createdAt || new Date().toISOString(),
              totalPayments: 1,
              totalAmount: payment.amount || 0,
              currency: payment.currency || 'USD'
            });
          } else {
            // Update existing customer with additional payment info
            const existingCustomer = customerMap.get(payment.customerId);
            existingCustomer.totalPayments += 1;
            existingCustomer.totalAmount += (payment.amount || 0);
            // Update transactionId if it's not already set or if current one is 'N/A'
            if (payment.transactionId && (existingCustomer.transactionId === 'N/A' || !existingCustomer.transactionId)) {
              existingCustomer.transactionId = payment.transactionId;
            }
            if (payment.createdAt && new Date(payment.createdAt) > new Date(existingCustomer.lastPaymentAt)) {
              existingCustomer.lastPaymentAt = payment.createdAt;
            }
          }
        }
      });
      
      return Array.from(customerMap.values());
    } catch (error) {
      console.error('Get customers error:', error);
      return [];
    }
  },

  // Get comprehensive dashboard statistics
  getDashboardStats: async (): Promise<{ data: any }> => {
    try {
      // Current merchant ID'yi al
      const merchantId = getCurrentMerchantId();
      console.log('📊 Getting dashboard stats for merchant:', merchantId);
      
      // Backend'den dashboard statistics'i çek - doğru endpoint
      const response = await dashboardApiClient.get(`/v1/merchant-dashboard/${merchantId}`);
      return { data: response.data };
    } catch (error) {
      console.error('Get dashboard stats error:', error);
      // Fallback olarak manual calculation
      const [payments, refunds] = await Promise.all([
        dashboardApiClient.get('/v1/payments').catch(() => ({ data: [] })),
        dashboardApiClient.get('/v1/refunds').catch(() => ({ data: [] }))
      ]);
      
      const paymentsData = payments.data || [];
      const refundsData = refunds.data || [];
      
      const stats = {
        totalPayments: paymentsData.length,
        totalAmount: paymentsData.reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
        successRate: paymentsData.length > 0 ? 
          (paymentsData.filter((p: any) => p.status === 'COMPLETED').length / paymentsData.length) * 100 : 0,
        pendingPayments: paymentsData.filter((p: any) => 
          p.status === 'PENDING' || p.status === 'PROCESSING').length,
        totalRefunds: refundsData.length,
        refundAmount: refundsData.reduce((sum: number, r: any) => sum + (r.amount || 0), 0),
        totalCustomers: new Set(paymentsData.map((p: any) => p.customerId)).size,
        totalDisputes: 12, // Mock data
        pendingDisputes: 3, // Mock data
        disputeRate: paymentsData.length > 0 ? (12 / paymentsData.length) * 100 : 0
      };
      
      return { data: stats };
    }
  },

  // Get payment statistics
  getPaymentStats: async (merchantId: string): Promise<PaymentStats> => {
    try {
      // For test mode, get all payments regardless of merchant ID
      const response = await dashboardApiClient.get(`/v1/payments`);
      const payments = response.data;
      
      // Calculate stats from payments
      const stats = {
        totalPayments: payments.length,
        successfulPayments: payments.filter((p: any) => p.status === 'COMPLETED').length,
        failedPayments: payments.filter((p: any) => p.status === 'FAILED').length,
        pendingPayments: payments.filter((p: any) => p.status === 'PENDING' || p.status === 'PROCESSING').length,
        totalAmount: payments.reduce((sum: number, p: any) => sum + p.amount, 0),
        successRate: payments.length > 0 ? (payments.filter((p: any) => p.status === 'COMPLETED').length / payments.length) * 100 : 0,
        averageAmount: payments.length > 0 ? payments.reduce((sum: number, p: any) => sum + p.amount, 0) / payments.length : 0,
      };
      
      return stats;
    } catch (error) {
      console.error('Get payment stats error:', error);
      // Return default stats on error
      return {
        totalPayments: 0,
        successfulPayments: 0,
        failedPayments: 0,
        pendingPayments: 0,
        totalAmount: 0,
        successRate: 0,
        averageAmount: 0,
      };
    }
  },

  // Get payments list with filters and pagination
  getPayments: async (
    merchantId: string, 
    filters?: DashboardFilters,
    page: number = 1,
    pageSize: number = 25
  ): Promise<PaymentListResponse> => {
    try {
      // For test mode, get all payments regardless of merchant ID
      console.log('Fetching payments from backend...');
      const response = await dashboardApiClient.get(`/v1/payments`);
      let payments = response.data;
      console.log('Backend payments response:', payments);

      // Convert date arrays to ISO strings if needed
      payments = payments.map((p: any) => ({
        ...p,
        createdAt: Array.isArray(p.createdAt) ? 
          new Date(p.createdAt[0], p.createdAt[1] - 1, p.createdAt[2], p.createdAt[3], p.createdAt[4], p.createdAt[5]).toISOString() : 
          p.createdAt,
        updatedAt: Array.isArray(p.updatedAt) ? 
          new Date(p.updatedAt[0], p.updatedAt[1] - 1, p.updatedAt[2], p.updatedAt[3], p.updatedAt[4], p.updatedAt[5]).toISOString() : 
          p.updatedAt,
        completedAt: Array.isArray(p.completedAt) ? 
          new Date(p.completedAt[0], p.completedAt[1] - 1, p.completedAt[2], p.completedAt[3], p.completedAt[4], p.completedAt[5]).toISOString() : 
          p.completedAt,
      }));

      // Apply filters
      if (filters?.search) {
        const searchTerm = filters.search.toLowerCase();
        payments = payments.filter((p: any) => 
          p.paymentId.toLowerCase().includes(searchTerm) ||
          p.transactionId.toLowerCase().includes(searchTerm) ||
          p.customerId.toLowerCase().includes(searchTerm) ||
          p.cardHolderName.toLowerCase().includes(searchTerm)
        );
      }
      
      if (filters?.status && filters.status.length > 0) {
        payments = payments.filter((p: any) => filters.status!.includes(p.status));
      }
      
      if (filters?.paymentMethod && filters.paymentMethod.length > 0) {
        payments = payments.filter((p: any) => filters.paymentMethod!.includes(p.paymentMethod));
      }
      
      if (filters?.dateRange) {
        if (filters.dateRange.startDate) {
          const startDate = new Date(filters.dateRange.startDate);
          payments = payments.filter((p: any) => new Date(p.createdAt) >= startDate);
        }
        if (filters.dateRange.endDate) {
          const endDate = new Date(filters.dateRange.endDate);
          payments = payments.filter((p: any) => new Date(p.createdAt) <= endDate);
        }
      }
      
      if (filters?.amountRange) {
        payments = payments.filter((p: any) => 
          p.amount >= filters.amountRange!.min && p.amount <= filters.amountRange!.max
        );
      }

      // Sort by creation date (newest first)
      payments.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Apply pagination
      const totalCount = payments.length;
      const startIndex = (page - 1) * pageSize;
      const paginatedPayments = payments.slice(startIndex, startIndex + pageSize);

      return {
        payments: paginatedPayments.map((p: any) => ({
          id: p.id,
          paymentId: p.paymentId || p.payment_id,
          transactionId: p.transactionId || p.transaction_id,
          merchantId: p.merchantId || p.merchant_id,
          customerId: p.customerId || p.customer_id,
          amount: p.amount,
          currency: p.currency,
          status: p.status,
          paymentMethod: p.paymentMethod || p.payment_method,
          cardNumber: p.cardNumber || p.card_number, // Already masked from backend
          cardHolderName: p.cardHolderName || p.card_holder_name,
          description: p.description || '',
          gatewayResponse: p.gatewayResponse || p.gateway_response,
          gatewayTransactionId: p.gatewayTransactionId || p.gateway_transaction_id,
          createdAt: p.createdAt || p.created_at,
          updatedAt: p.updatedAt || p.updated_at,
        })),
        pagination: {
          page,
          currentPage: page,
          pageSize,
          totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
          hasNext: page < Math.ceil(totalCount / pageSize),
          hasPrev: page > 1,
        }
      };
    } catch (error) {
      console.error('Get payments error:', error);
      return {
        payments: [],
        pagination: {
          page,
          currentPage: page,
          pageSize,
          totalCount: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        }
      };
    }
  },

  // Get payment detail with events and logs
  getPaymentDetail: async (paymentId: string): Promise<PaymentDetail> => {
    try {
      // Try to get by payment ID first, then by transaction ID
      let response;
      try {
        response = await dashboardApiClient.get(`/v1/payments/payment/${paymentId}`);
      } catch (error: any) {
        if (error.response?.status === 404) {
          // Try with transaction ID
          response = await dashboardApiClient.get(`/v1/payments/transaction/${paymentId}`);
        } else {
          throw error;
        }
      }
      
      const payment = response.data;
      
      // Convert date arrays to ISO strings if needed
      const convertDate = (dateField: any) => {
        if (Array.isArray(dateField)) {
          return new Date(dateField[0], dateField[1] - 1, dateField[2], dateField[3], dateField[4], dateField[5]).toISOString();
        }
        return dateField;
      };
      
      // Convert backend response to frontend format
      return {
        id: payment.id,
        paymentId: payment.paymentId || payment.payment_id,
        transactionId: payment.transactionId || payment.transaction_id,
        merchantId: payment.merchantId || payment.merchant_id,
        customerId: payment.customerId || payment.customer_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.paymentMethod || payment.payment_method,
        cardNumber: payment.cardNumber || payment.card_number,
        cardHolderName: payment.cardHolderName || payment.card_holder_name,
        cardBrand: payment.cardBrand || payment.card_brand,
        cardBin: payment.cardBin || payment.card_bin,
        cardLastFour: payment.cardLastFour || payment.card_last_four,
        description: payment.description || '',
        gatewayResponse: payment.gatewayResponse || payment.gateway_response,
        gatewayTransactionId: payment.gatewayTransactionId || payment.gateway_transaction_id,
        createdAt: convertDate(payment.createdAt) || convertDate(payment.created_at),
        updatedAt: convertDate(payment.updatedAt) || convertDate(payment.updated_at),
        completedAt: convertDate(payment.completedAt) || convertDate(payment.completed_at),
        // Mock events and logs for now
        events: [
          {
            id: '1',
            eventType: 'PAYMENT_INITIATED',
            timestamp: convertDate(payment.createdAt),
            status: 'INFO' as const,
            message: 'Payment request received',
            details: { amount: payment.amount, currency: payment.currency }
          },
          {
            id: '2',
            eventType: 'PAYMENT_PROCESSING',
            timestamp: convertDate(payment.updatedAt),
            status: payment.status === 'COMPLETED' ? 'SUCCESS' as const : payment.status === 'FAILED' ? 'FAILED' as const : 'INFO' as const,
            message: `Payment ${payment.status.toLowerCase()}`,
            details: { gateway: payment.gatewayTransactionId }
          }
        ],
        logs: [
          {
            id: '1',
            level: 'INFO' as const,
            timestamp: convertDate(payment.createdAt),
            message: `POST /v1/payments - Payment created`,
            source: 'API' as const,
            latency: 150,
            urlPath: '/v1/payments'
          },
          {
            id: '2',
            level: payment.status === 'FAILED' ? 'ERROR' as const : 'INFO' as const,
            timestamp: convertDate(payment.updatedAt),
            message: `Payment ${payment.status} - ${payment.gatewayResponse || 'No response'}`,
            source: 'GATEWAY' as const,
            latency: 200,
            urlPath: '/gateway/process'
          }
        ]
      };
    } catch (error) {
      console.error('Get payment detail error:', error);
      throw error;
    }
  },

  // Get payment events and logs (like Hyperswitch)
  getPaymentEvents: async (paymentId: string) => {
    // This will be implemented when backend supports it
    // const response = await dashboardApiClient.get(`/v1/payments/${paymentId}/events`);
    // return response.data;
    
    // Mock data for now
    return {
      events: [
        {
          id: '1',
          eventType: 'PAYMENT_INITIATED',
          timestamp: new Date().toISOString(),
          status: 'INFO' as const,
          message: 'Payment request received',
          details: { amount: 100, currency: 'TRY' }
        },
        {
          id: '2', 
          eventType: 'PAYMENT_PROCESSING',
          timestamp: new Date().toISOString(),
          status: 'INFO' as const,
          message: 'Payment being processed',
          details: { gateway: 'Garanti BBVA' }
        }
      ],
      logs: [
        {
          id: '1',
          level: 'INFO' as const,
          timestamp: new Date().toISOString(),
          message: 'POST /v1/payments - 200 OK',
          source: 'API' as const,
          latency: 150,
          urlPath: '/v1/payments'
        }
      ]
    };
  },

  // Sync payment status (like Hyperswitch sync button)
  syncPaymentStatus: async (paymentId: string) => {
    const response = await dashboardApiClient.post(`/v1/payments/${paymentId}/sync`);
    return response.data;
  },

  // ===== REFUND API METHODS =====

  // Get refund statistics
  getRefundStats: async (merchantId: string): Promise<RefundStats> => {
    try {
      // For test mode, get all refunds regardless of merchant ID
      const response = await dashboardApiClient.get(`/v1/refunds`);
      const refunds = response.data;
      
      // Calculate stats from refunds
      const stats = {
        totalRefunds: refunds.length,
        completedRefunds: refunds.filter((r: any) => r.status === 'COMPLETED').length,
        pendingRefunds: refunds.filter((r: any) => r.status === 'PENDING' || r.status === 'PROCESSING').length,
        failedRefunds: refunds.filter((r: any) => r.status === 'FAILED').length,
        totalRefundAmount: refunds.reduce((sum: number, r: any) => sum + r.amount, 0),
        refundRate: refunds.length > 0 ? (refunds.filter((r: any) => r.status === 'COMPLETED').length / refunds.length) * 100 : 0,
        averageRefundAmount: refunds.length > 0 ? refunds.reduce((sum: number, r: any) => sum + r.amount, 0) / refunds.length : 0,
      };
      
      return stats;
    } catch (error) {
      console.error('Get refund stats error:', error);
      // Return default stats on error
      return {
        totalRefunds: 0,
        completedRefunds: 0,
        pendingRefunds: 0,
        failedRefunds: 0,
        totalRefundAmount: 0,
        refundRate: 0,
        averageRefundAmount: 0,
      };
    }
  },

  // Get refunds list with filters and pagination
  getRefunds: async (
    merchantId: string, 
    filters?: RefundFilters,
    page: number = 1,
    pageSize: number = 25
  ): Promise<{ refunds: RefundListItem[]; pagination: PaginationInfo; stats?: RefundStats }> => {
    try {
      // For test mode, get all refunds regardless of merchant ID
      console.log('Fetching refunds from backend...');
      const response = await dashboardApiClient.get(`/v1/refunds`);
      let refunds = response.data;
      console.log('Backend refunds response:', refunds);

      // Convert date arrays to ISO strings if needed
      refunds = refunds.map((r: any) => ({
        ...r,
        refundDate: Array.isArray(r.refundDate) ? 
          new Date(r.refundDate[0], r.refundDate[1] - 1, r.refundDate[2], r.refundDate[3], r.refundDate[4], r.refundDate[5]).toISOString() : 
          r.refundDate,
        createdAt: Array.isArray(r.createdAt) ? 
          new Date(r.createdAt[0], r.createdAt[1] - 1, r.createdAt[2], r.createdAt[3], r.createdAt[4], r.createdAt[5]).toISOString() : 
          r.createdAt,
        updatedAt: Array.isArray(r.updatedAt) ? 
          new Date(r.updatedAt[0], r.updatedAt[1] - 1, r.updatedAt[2], r.updatedAt[3], r.updatedAt[4], r.updatedAt[5]).toISOString() : 
          r.updatedAt,
      }));

      // Apply filters
      if (filters?.search) {
        const searchTerm = filters.search.toLowerCase();
        refunds = refunds.filter((r: any) => 
          r.refundId?.toLowerCase().includes(searchTerm) ||
          r.paymentId?.toLowerCase().includes(searchTerm) ||
          r.transactionId?.toLowerCase().includes(searchTerm) ||
          r.customerId?.toLowerCase().includes(searchTerm) ||
          r.description?.toLowerCase().includes(searchTerm)
        );
      }

      if (filters?.status) {
        refunds = refunds.filter((r: any) => r.status === filters.status);
      }

      if (filters?.dateFrom) {
        refunds = refunds.filter((r: any) => new Date(r.createdAt) >= new Date(filters.dateFrom!));
      }

      if (filters?.dateTo) {
        refunds = refunds.filter((r: any) => new Date(r.createdAt) <= new Date(filters.dateTo!));
      }

      // Sort by creation date (newest first)
      refunds.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Apply pagination
      const totalCount = refunds.length;
      const startIndex = (page - 1) * pageSize;
      const paginatedRefunds = refunds.slice(startIndex, startIndex + pageSize);

      return {
        refunds: paginatedRefunds.map((r: any) => ({
          id: r.id,
          refundId: r.refundId || r.refund_id,
          paymentId: r.paymentId || r.payment_id,
          transactionId: r.transactionId || r.transaction_id,
          merchantId: r.merchantId || r.merchant_id,
          customerId: r.customerId || r.customer_id,
          amount: r.amount,
          currency: r.currency,
          status: r.status,
          reason: r.reason,
          description: r.description || '',
          gatewayResponse: r.gatewayResponse || r.gateway_response,
          gatewayRefundId: r.gatewayRefundId || r.gateway_refund_id,
          refundDate: r.refundDate || r.refund_date,
          createdAt: r.createdAt || r.created_at,
          updatedAt: r.updatedAt || r.updated_at,
        })),
        pagination: {
          page,
          currentPage: page,
          totalPages: Math.ceil(totalCount / pageSize),
          totalCount,
          pageSize,
          hasNext: page < Math.ceil(totalCount / pageSize),
          hasPrev: page > 1,
        }
      };
    } catch (error) {
      console.error('Get refunds error:', error);
      throw error;
    }
  },

  // Get refund detail with events and logs
  getRefundDetail: async (refundId: string): Promise<RefundDetail> => {
    try {
      // Try to get by refund ID first
      let response;
      try {
        response = await dashboardApiClient.get(`/v1/refunds/refund-id/${refundId}`);
      } catch (error: any) {
        if (error.response?.status === 404) {
          // Try with payment ID or transaction ID as fallback
          throw new Error(`Refund not found: ${refundId}`);
        } else {
          throw error;
        }
      }
      
      const refund = response.data;
      
      // Convert date arrays to ISO strings if needed
      const convertDate = (dateField: any) => {
        if (Array.isArray(dateField)) {
          return new Date(dateField[0], dateField[1] - 1, dateField[2], dateField[3], dateField[4], dateField[5]).toISOString();
        }
        return dateField;
      };
      
      // Convert backend response to frontend format
      return {
        id: refund.id,
        refundId: refund.refundId || refund.refund_id,
        paymentId: refund.paymentId || refund.payment_id,
        transactionId: refund.transactionId || refund.transaction_id,
        merchantId: refund.merchantId || refund.merchant_id,
        customerId: refund.customerId || refund.customer_id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        reason: refund.reason,
        description: refund.description || '',
        gatewayResponse: refund.gatewayResponse || refund.gateway_response,
        gatewayRefundId: refund.gatewayRefundId || refund.gateway_refund_id,
        refundDate: convertDate(refund.refundDate) || convertDate(refund.refund_date),
        createdAt: convertDate(refund.createdAt) || convertDate(refund.created_at),
        updatedAt: convertDate(refund.updatedAt) || convertDate(refund.updated_at),
        // Mock events and logs for now
        events: [
          {
            id: '1',
            eventType: 'REFUND_INITIATED',
            timestamp: convertDate(refund.createdAt),
            status: 'INFO' as const,
            message: 'Refund request received',
            details: { amount: refund.amount, currency: refund.currency }
          },
          {
            id: '2',
            eventType: 'REFUND_PROCESSING',
            timestamp: convertDate(refund.updatedAt),
            status: refund.status === 'COMPLETED' ? 'SUCCESS' as const : refund.status === 'FAILED' ? 'FAILED' as const : 'INFO' as const,
            message: `Refund ${refund.status.toLowerCase()}`,
            details: { gateway: refund.gatewayRefundId }
          }
        ],
        logs: [
          {
            id: '1',
            level: 'INFO' as const,
            timestamp: convertDate(refund.createdAt),
            message: `POST /v1/refunds - Refund created`,
            source: 'API' as const,
            latency: 150,
            urlPath: '/v1/refunds'
          },
          {
            id: '2',
            level: refund.status === 'FAILED' ? 'ERROR' as const : 'INFO' as const,
            timestamp: convertDate(refund.updatedAt),
            message: `Refund ${refund.status} - ${refund.gatewayResponse || 'No response'}`,
            source: 'GATEWAY' as const,
            latency: 200,
            urlPath: '/gateway/refund'
          }
        ]
      };
    } catch (error) {
      console.error('Get refund detail error:', error);
      throw error;
    }
  },

  // Create new refund
  createRefund: async (refundData: {
    paymentId: string;
    transactionId: string;
    merchantId: string;
    customerId: string;
    amount: number;
    currency: string;
    reason: RefundReason;
    description?: string;
  }) => {
    try {
      const response = await dashboardApiClient.post('/v1/refunds', refundData);
      return response.data;
    } catch (error) {
      console.error('Create refund error:', error);
      throw error;
    }
  },

  // Dispute operations
  getDisputeStats: async (merchantId?: string): Promise<DisputeStats> => {
    try {
      // Merchant ID belirtilmemişse current merchant'ı kullan
      const targetMerchantId = merchantId || getCurrentMerchantId();
      console.log('📊 Fetching dispute stats for merchant:', targetMerchantId);
      
      const apiUrl = `/v1/merchant-dashboard/${targetMerchantId}/disputes`;
      console.log('🌐 Stats API URL:', apiUrl);
      
      // API key'i manuel olarak ekle
      const apiKey = localStorage.getItem('auth_api_key');
      console.log('🔑 Using API key:', apiKey ? 'Present' : 'Missing');
      
      const response = await dashboardApiClient.get(apiUrl, {
        headers: {
          'X-API-Key': apiKey || ''
        }
      });
      console.log('✅ Dispute stats response status:', response.status);
      console.log('✅ Dispute stats response data:', response.data);
      
      return response.data;
    } catch (error: any) {
      console.error('❌ Get dispute stats error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  },

  getDisputes: async (
    merchantId?: string,
    page: number = 0,
    size: number = 20,
    filters?: DisputeFilters
  ): Promise<{ disputes: DisputeListItem[]; pagination: PaginationInfo }> => {
    try {
      // Merchant ID belirtilmemişse current merchant'ı kullan
      const targetMerchantId = merchantId || getCurrentMerchantId();
      console.log('📄 Fetching disputes for merchant:', targetMerchantId, '- page:', page, 'size:', size, 'filters:', filters);
      
      const params = new URLSearchParams({
        page: page.toString(),
        size: size.toString(),
      });

      if (filters?.status?.length) {
        filters.status.forEach(s => params.append('status', s));
      }
      if (filters?.reason?.length) {
        filters.reason.forEach(r => params.append('reason', r));
      }
      if (filters?.dateFrom) {
        params.append('dateFrom', filters.dateFrom);
      }
      if (filters?.dateTo) {
        params.append('dateTo', filters.dateTo);
      }
      if (filters?.minAmount !== undefined) {
        params.append('minAmount', filters.minAmount.toString());
      }
      if (filters?.maxAmount !== undefined) {
        params.append('maxAmount', filters.maxAmount.toString());
      }
      if (filters?.search) {
        params.append('search', filters.search);
      }

      const apiUrl = `/v1/merchant-dashboard/${targetMerchantId}/disputes/list?${params}`;
      console.log('🌐 API URL:', apiUrl);

      const response = await dashboardApiClient.get(apiUrl);
      console.log('✅ Disputes API response status:', response.status);
      console.log('✅ Disputes API response data:', response.data);
      console.log('✅ Disputes content length:', response.data.content?.length || 0);

      return {
        disputes: response.data.content || [],
        pagination: {
          page: response.data.page || 0,
          totalPages: response.data.totalPages || 0,
          totalCount: response.data.totalElements || 0,
          pageSize: response.data.size || 20,
          hasNext: !response.data.last,
          hasPrev: !response.data.first,
        }
      };
    } catch (error: any) {
      console.error('❌ Get disputes error:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      throw error;
    }
  },

  getDisputeDetail: async (
    disputeId: string,
    merchantId?: string
  ): Promise<DisputeDetail> => {
    try {
      // Merchant ID belirtilmemişse current merchant'ı kullan
      const targetMerchantId = merchantId || getCurrentMerchantId();
      console.log('🔍 Fetching dispute detail:', disputeId, 'for merchant:', targetMerchantId);
      
      // Doğru endpoint: /v1/disputes/dispute-id/{disputeId}
      const apiUrl = `/v1/disputes/dispute-id/${disputeId}`;
      console.log('🌐 API URL:', apiUrl);
      
      // API key'i manuel olarak ekle
      const apiKey = localStorage.getItem('auth_api_key');
      console.log('🔑 Using API key:', apiKey ? 'Present' : 'Missing');
      
      const response = await dashboardApiClient.get(apiUrl, {
        headers: {
          'X-API-Key': apiKey || ''
        }
      });
      console.log('✅ Dispute detail response:', response.data);
      return response.data;
    } catch (error) {
      console.error('Get dispute detail error:', error);
      throw error;
    }
  },

  respondToDispute: async (
    merchantId: string = 'MERCH001',
    disputeId: string,
    disputeResponse: DisputeResponse
  ): Promise<{ success: boolean; message: string; nextStep?: string }> => {
    try {
      console.log('📝 Responding to dispute:', disputeId, 'type:', disputeResponse.responseType);
      const response = await dashboardApiClient.post(
        `/v1/merchant-dashboard/${merchantId}/disputes/${disputeId}/respond`,
        disputeResponse
      );
      console.log('✅ Dispute response submitted:', response.data);
      return response.data;
    } catch (error) {
      console.error('Respond to dispute error:', error);
      throw error;
    }
  }
};

// Export both for compatibility
export const dashboardApi = dashboardAPI;
export default dashboardAPI;