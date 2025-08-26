import React from 'react';

export interface PaymentStats {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  totalAmount: number;
  successRate: number;
  averageAmount: number;
}

// Dispute related types
export interface DisputeStats {
  totalDisputes: number;
  pendingResponses: number;
  activeDisputes: number;
  wonDisputes: number;
  lostDisputes: number;
  winRate: number;
  totalDisputeAmount: number;
  totalDisputeAmountsByCurrency?: Record<string, number>;
  urgentDisputes: number;
  recentDisputes: number;
  reasonBreakdown: Record<string, number>;
  needsAttention: boolean;
}

export enum DisputeStatus {
  OPENED = 'OPENED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  EVIDENCE_REQUIRED = 'EVIDENCE_REQUIRED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  WON = 'WON',
  LOST = 'LOST',
  PARTIAL_REFUND = 'PARTIAL_REFUND',
  // Bank dispute statuses
  BANK_INITIATED = 'BANK_INITIATED',
  MERCHANT_NOTIFIED = 'MERCHANT_NOTIFIED',
  AWAITING_MERCHANT_RESPONSE = 'AWAITING_MERCHANT_RESPONSE',
  PENDING_MERCHANT_RESPONSE = 'PENDING_MERCHANT_RESPONSE',
  MERCHANT_ACCEPTED = 'MERCHANT_ACCEPTED',
  MERCHANT_DEFENDED = 'MERCHANT_DEFENDED',
  ADMIN_EVALUATING = 'ADMIN_EVALUATING',
  PENDING_ADMIN_EVALUATION = 'PENDING_ADMIN_EVALUATION',
  BANK_DECISION_PENDING = 'BANK_DECISION_PENDING',
  BANK_APPROVED = 'BANK_APPROVED',
  BANK_REJECTED = 'BANK_REJECTED'
}

export enum DisputeReason {
  FRAUD = 'FRAUD',
  DUPLICATE = 'DUPLICATE',
  PRODUCT_NOT_RECEIVED = 'PRODUCT_NOT_RECEIVED',
  PRODUCT_NOT_AS_DESCRIBED = 'PRODUCT_NOT_AS_DESCRIBED',
  CREDIT_NOT_PROCESSED = 'CREDIT_NOT_PROCESSED',
  GENERAL = 'GENERAL',
  OTHER = 'OTHER'
}

export enum DisputeResponseType {
  ACCEPT = 'ACCEPT',
  DEFEND = 'DEFEND'
}

export interface DisputeListItem {
  disputeId: string;
  paymentId: string;
  merchantId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: DisputeStatus;
  reason: DisputeReason;
  disputeDate: string;
  merchantResponseDeadline?: string;
  bankResponseDeadline?: string;
  evidence?: string;
  merchantNotes?: string;
  adminNotes?: string;
  bankDecision?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DisputeDetail extends DisputeListItem {
  transactionId?: string;
  customerEmail?: string;
  description?: string;
  events?: DisputeEvent[];
  logs?: DisputeLog[];
}

export interface DisputeEvent {
  id: number;
  disputeId: string;
  eventType: string;
  description: string;
  createdAt: string;
  metadata?: Record<string, any>;
}

export interface DisputeLog {
  id: number;
  disputeId: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  details?: string;
  createdAt: string;
}

export interface DisputeFilters {
  status?: DisputeStatus[];
  reason?: DisputeReason[];
  dateFrom?: string;
  dateTo?: string;
  minAmount?: number;
  maxAmount?: number;
  search?: string;
}

export interface DisputeResponse {
  responseType: DisputeResponseType;
  evidence?: string;
  notes?: string;
}

// Refund related types
export interface RefundStats {
  totalRefunds: number;
  completedRefunds: number;
  pendingRefunds: number;
  failedRefunds: number;
  totalRefundAmount: number;
  refundRate: number;
  averageRefundAmount: number;
}

export interface RefundListItem {
  id: number;
  refundId: string;
  paymentId: string;
  transactionId: string;
  merchantId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: RefundReason;
  description?: string;
  gatewayResponse?: string;
  gatewayRefundId?: string;
  gatewayTransactionId?: string;
  refundDate: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface RefundDetail extends RefundListItem {
  events?: RefundEvent[];
  logs?: RefundLog[];
}

export interface RefundEvent {
  id: string;
  eventType: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILED' | 'INFO';
  message: string;
  details?: Record<string, any>;
}

export interface RefundLog {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  timestamp: string;
  message: string;
  source: 'API' | 'GATEWAY' | 'SDK';
  latency?: number;
  urlPath?: string;
  requestId?: string;
  merchantId?: string;
  refundId?: string;
  apiAuthType?: string;
  details?: Record<string, any>;
}

export enum RefundStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum RefundReason {
  CUSTOMER_REQUEST = 'CUSTOMER_REQUEST',
  MERCHANT_REQUEST = 'MERCHANT_REQUEST',
  DUPLICATE_PAYMENT = 'DUPLICATE_PAYMENT',
  FRAUD = 'FRAUD',
  TECHNICAL_ERROR = 'TECHNICAL_ERROR',
  OTHER = 'OTHER',
}

export interface DashboardFilters {
  search?: string;
  status?: PaymentStatus[];
  dateFrom?: string;
  dateTo?: string;
  paymentMethod?: PaymentMethod[];
  currency?: string;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  amountRange?: {
    min: number;
    max: number;
  };
}

export interface RefundFilters {
  search?: string;
  status?: RefundStatus[];
  dateFrom?: string;
  dateTo?: string;
  reason?: RefundReason[];
  currency?: string;
  dateRange?: {
    startDate?: string;
    endDate?: string;
  };
  amountRange?: {
    min: number;
    max: number;
  };
}

export interface PaginationInfo {
  page: number;
  currentPage?: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaymentListItem {
  id: number;
  paymentId: string;
  transactionId: string;
  merchantId: string;
  customerId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  cardNumber: string; // masked
  cardHolderName: string;
  description?: string;
  gatewayResponse?: string;
  gatewayTransactionId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentDetail extends PaymentListItem {
  cardBrand?: string;
  cardBin?: string;
  cardLastFour?: string;
  completedAt?: string;
  events?: PaymentEvent[];
  logs?: PaymentLog[];
}

export interface PaymentEvent {
  id: string;
  eventType: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILED' | 'INFO';
  message: string;
  details?: Record<string, any>;
}

export interface PaymentLog {
  id: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  timestamp: string;
  message: string;
  source: 'API' | 'SDK' | 'GATEWAY';
  requestId?: string;
  merchantId?: string;
  paymentId?: string;
  refundId?: string;
  apiAuthType?: string;
  latency?: number;
  urlPath?: string;
  details?: Record<string, any>;
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING', 
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED'
}

export enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  DIGITAL_WALLET = 'DIGITAL_WALLET'
}

export enum CustomerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  VERIFIED = 'VERIFIED',
  UNVERIFIED = 'UNVERIFIED'
}

export interface CustomerDetail {
  id: number;
  customerId: string;
  transactionId?: string;
  customerName: string;
  email: string;
  phoneCountryCode?: string;
  phone?: string;
  description?: string;
  address?: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
  lastPaymentAt?: string;
  totalPayments: number;
  totalAmount: number;
  currency: string;
}

export interface TableColumn<T> {
  key: keyof T;
  title: string;
  width?: string;
  sortable?: boolean;
  render?: (value: any, record: T) => React.ReactNode;
}