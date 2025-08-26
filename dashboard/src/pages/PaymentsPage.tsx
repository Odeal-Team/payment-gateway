import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Pagination,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Sync, FileDownload } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { dashboardAPI } from '../services/dashboardApi';
import { 
  PaymentListItem, 
  PaymentStats, 
  DashboardFilters,
  PaymentStatus,
  PaymentMethod 
} from '../types/dashboard';
import PaymentsTable from '../components/payments/PaymentsTable';
import PaymentsFilters from '../components/payments/PaymentsFilters';
import StatsCards, { StatsCard } from '../components/common/StatsCards';

const PaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  
  // State
  const [payments, setPayments] = useState<PaymentListItem[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  });

  // Mock data - replace with real API calls
  const mockPayments: PaymentListItem[] = [
    {
      id: 1,
      paymentId: 'pay_O7H7KL7PWnc92drRvE8Z',
      transactionId: 'txn_123456',
      merchantId: 'MERCH001',
      customerId: 'CUST001',
      amount: 44.00,
      currency: 'USD',
      status: PaymentStatus.COMPLETED,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      cardNumber: '************1234',
      cardHolderName: 'John Doe',
      description: 'Test payment',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 2,
      paymentId: 'pay_SozTspZVydlSOlH4r',
      transactionId: 'txn_789012',
      merchantId: 'MERCH001',
      customerId: 'CUST002',
      amount: 100.00,
      currency: 'USD',
      status: PaymentStatus.FAILED,
      paymentMethod: PaymentMethod.CREDIT_CARD,
      cardNumber: '************5678',
      cardHolderName: 'Jane Smith',
      description: 'Failed payment test',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 3,
      paymentId: 'pay_V9N3HBq0Q6hSls',
      transactionId: 'txn_345678',
      merchantId: 'MERCH001',
      customerId: 'CUST003',
      amount: 100.00,
      currency: 'USD',
      status: PaymentStatus.PENDING,
      paymentMethod: PaymentMethod.DIGITAL_WALLET,
      cardNumber: '************9012',
      cardHolderName: 'Bob Wilson',
      description: 'Pending payment',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: new Date(Date.now() - 7200000).toISOString(),
    },
    {
      id: 4,
      paymentId: 'pay_VSWYsfUPKyowec',
      transactionId: 'txn_901234',
      merchantId: 'MERCH001',
      customerId: 'CUST004',
      amount: 44.00,
      currency: 'USD',
      status: PaymentStatus.PROCESSING,
      paymentMethod: PaymentMethod.BANK_TRANSFER,
      cardNumber: '************3456',
      cardHolderName: 'Alice Johnson',
      description: 'Processing payment',
      createdAt: new Date(Date.now() - 10800000).toISOString(),
      updatedAt: new Date(Date.now() - 10800000).toISOString(),
    },
  ];

  const mockStats: PaymentStats = {
    totalPayments: 4,
    successfulPayments: 1,
    failedPayments: 1,
    pendingPayments: 2,
    totalAmount: 288.00,
    successRate: 25,
    averageAmount: 72.00,
  };

  // Load data
  const loadPayments = async () => {
    // Temporary: Skip auth check for testing
    // if (!authState.user?.merchantId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      console.log('Loading payments from real API...');
      
      // Real API call
      const response = await dashboardAPI.getPayments(
        authState.user?.merchantId || 'TEST_MERCHANT',
        filters,
        pagination.page,
        pagination.pageSize
      );
      
      console.log('Payments API response:', response);
      console.log('Setting payments to state:', response.payments);
      
      setPayments(response.payments);
      setPagination(prev => ({
        ...prev,
        total: response.pagination.totalCount,
        totalPages: response.pagination.totalPages,
      }));
      
      // Get real stats
      const statsResponse = await dashboardAPI.getPaymentStats(authState.user?.merchantId || 'TEST_MERCHANT');
      console.log('Stats API response:', statsResponse);
      setStats(statsResponse);
      
    } catch (err: any) {
      console.error('Error loading payments:', err);
      setError(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, [authState.user?.merchantId, pagination.page, pagination.pageSize, filters]);

  // Event handlers
  const handleFiltersChange = (newFilters: DashboardFilters) => {
    setFilters(newFilters);
  };

  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    loadPayments();
  };

  const handleClearFilters = () => {
    setFilters({});
    setPagination(prev => ({ ...prev, page: 1 }));
    loadPayments();
  };

  const handleRowClick = (payment: PaymentListItem) => {
    navigate(`/dashboard/payments/${payment.paymentId}`);
  };

  const handleProcessAgain = (payment: PaymentListItem) => {
    // PaymentListItem'dan gerekli bilgileri alıp ProcessPaymentPage'e gönder
    navigate('/dashboard/process-payment', {
      state: {
        payment: {
          customerId: payment.customerId,
          amount: payment.amount,
          currency: payment.currency,
          paymentMethod: payment.paymentMethod,
          description: payment.description,
        }
      }
    });
  };

  const handleSyncPayment = async (paymentId: string) => {
    try {
      // TODO: Implement sync functionality
      // await dashboardAPI.syncPaymentStatus(paymentId);
      console.log('Syncing payment:', paymentId);
      loadPayments(); // Refresh data
    } catch (err: any) {
      setError(err.message || 'Failed to sync payment');
    }
  };

  const handlePageChange = (event: React.ChangeEvent<unknown>, value: number) => {
    setPagination(prev => ({ ...prev, page: value }));
  };

  const handleExport = () => {
    try {
      const headers = [
        'ID',
        'Payment ID',
        'Transaction ID',
        'Merchant ID',
        'Customer ID',
        'Amount',
        'Currency',
        'Status',
        'Payment Method',
        'Card Number',
        'Card Holder Name',
        'Description',
        'Created At',
        'Updated At',
      ];

      const excelEscape = (text: string) =>
        text
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');

      const toCell = (value: any, type: 'String' | 'Number' = 'String') => {
        if (value === null || value === undefined) value = '';
        if (type === 'Number' && value !== '') {
          const num = Number(value);
          if (!isNaN(num)) {
            return `<Cell><Data ss:Type="Number">${num}</Data></Cell>`;
          }
        }
        return `<Cell><Data ss:Type="String">${excelEscape(String(value))}</Data></Cell>`;
      };

      const rowsXml = payments
        .map(p => {
          return (
            '<Row>' +
            [
              toCell(p.id, 'Number'),
              toCell(p.paymentId),
              toCell(p.transactionId),
              toCell(p.merchantId),
              toCell(p.customerId),
              toCell(p.amount, 'Number'),
              toCell(p.currency),
              toCell(p.status),
              toCell(p.paymentMethod),
              toCell(p.cardNumber),
              toCell(p.cardHolderName),
              toCell(p.description || ''),
              toCell(p.createdAt),
              toCell(p.updatedAt),
            ].join('') +
            '</Row>'
          );
        })
        .join('');

      const headerRow = '<Row>' + headers.map(h => `<Cell><Data ss:Type="String">${excelEscape(h)}</Data></Cell>`).join('') + '</Row>';

      const workbook =
        `<?xml version="1.0"?>` +
        `<?mso-application progid="Excel.Sheet"?>` +
        `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" ` +
        `xmlns:o="urn:schemas-microsoft-com:office:office" ` +
        `xmlns:x="urn:schemas-microsoft-com:office:excel" ` +
        `xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ` +
        `xmlns:html="http://www.w3.org/TR/REC-html40">` +
        `<Worksheet ss:Name="Payments">` +
        `<Table>` +
        headerRow +
        rowsXml +
        `</Table>` +
        `</Worksheet>` +
        `</Workbook>`;

      const blob = new Blob([workbook], { type: 'application/vnd.ms-excel' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const now = new Date();
      const ts = now.toISOString().replace(/[:.]/g, '-');
      a.download = `payments-${ts}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
      setError('Failed to export payments');
    }
  };

  const getStatsCards = (): StatsCard[] => {
    if (!stats) return [];
    
    return [
      {
        title: 'All',
        value: stats.totalPayments,
        subtitle: 'Total Payments',
        color: 'primary'
      },
      {
        title: 'Succeeded',
        value: stats.successfulPayments,
        subtitle: 'Successful',
        color: 'success'
      },
      {
        title: 'Failed',
        value: stats.failedPayments,
        subtitle: 'Failed',
        color: 'error'
      },
      {
        title: 'Pending',
        value: stats.pendingPayments,
        subtitle: 'Pending',
        color: 'warning'
      }
    ];
  };

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Payments
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage and monitor all payment transactions
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<FileDownload />}
            onClick={handleExport}
          >
            Export
          </Button>
          <Button
            variant="contained"
            startIcon={<Sync />}
            onClick={loadPayments}
            disabled={loading}
          >
            Sync
          </Button>
        </Box>
      </Box>

      {/* Stats Cards */}
      {stats && (
        <Box sx={{ mb: 3 }}>
          <StatsCards cards={getStatsCards()} />
        </Box>
      )}

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <PaymentsFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onSearch={handleSearch}
        onClearFilters={handleClearFilters}
      />

      {/* Loading State */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Payments Table */}
      {!loading && (
        <>
          <PaymentsTable
            payments={payments}
            loading={loading}
            onRowClick={handleRowClick}
            onSyncPayment={handleSyncPayment}
            onProcessAgain={handleProcessAgain}
          />

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination
                count={pagination.totalPages}
                page={pagination.page}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
              />
            </Box>
          )}
        </>
      )}
    </Box>
  );
};

export default PaymentsPage;