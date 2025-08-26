import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Chip,
  Divider,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Avatar,
} from '@mui/material';
import {
  ArrowBack,
  Sync,
  ContentCopy,
  OpenInNew,
  Person,
  Email,
  Phone,
  LocationOn,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CustomerDetail, CustomerStatus, RefundListItem } from '../types/dashboard';
import StatusChip from '../components/common/StatusChip';
import { dashboardAPI } from '../services/dashboardApi';
import { useAuth } from '../contexts/AuthContext';

const CustomerDetailPage: React.FC = () => {
  const { customerId } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  const currentMerchantId = React.useMemo(() => {
    return authState.user?.merchantId || (() => {
      try {
        const userStr = localStorage.getItem('auth_user');
        if (userStr) return JSON.parse(userStr).merchantId;
      } catch {}
      return 'TEST_MERCHANT';
    })();
  }, [authState.user]);
  
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentIntents, setPaymentIntents] = useState<any[]>([]);
  const [paymentAttempts, setPaymentAttempts] = useState<any[]>([]);
  const [refunds, setRefunds] = useState<any[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);

  const loadCustomerDetail = async () => {
    if (!customerId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Backend'den bu müşteriye ait ödemeleri doğrudan çek
      const customerPayments = await dashboardAPI.getCustomerPayments(customerId);
      
      if (customerPayments.length === 0) {
        setError('No payments found for this customer');
        return;
      }
      
      // Create customer info from first payment
      const firstPayment = customerPayments[0];
      const customerInfo: CustomerDetail = {
        id: Date.now(),
        customerId: customerId,
        customerName: firstPayment.cardHolderName || 'Unknown Customer',
        email: 'no-email@example.com', // PaymentListItem'da email yok
        phone: undefined, // PaymentListItem'da phone yok
        description: `Customer derived from payment ${firstPayment.paymentId}`,
        address: undefined, // PaymentListItem'da address yok
        status: 'ACTIVE' as any,
        createdAt: firstPayment.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastPaymentAt: firstPayment.createdAt || new Date().toISOString(),
        totalPayments: customerPayments.length,
        totalAmount: customerPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0),
        currency: firstPayment.currency || 'USD'
      };
      
      setCustomer(customerInfo);
      
      // Load payment data using the real-time data
      await loadPaymentData(customerInfo, customerPayments);
      
      // Load dispute data for this customer
      await loadDisputeData(customerId);
      
    } catch (err: any) {
      setError(err.message || 'Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  const loadDisputeData = async (customerId: string) => {
    try {
      console.log('🔍 Loading dispute data for customer:', customerId);
      
      // Tüm dispute'ları getir ve customer ID'ye göre filtrele
      const response = await fetch('http://localhost:8080/v1/disputes', {
        headers: {
          'X-API-Key': localStorage.getItem('auth_api_key') || ''
        }
      });
      
      if (response.ok) {
        const allDisputes = await response.json();
        const customerDisputes = allDisputes.filter((dispute: any) => 
          dispute.customerId === customerId
        );
        
        // Duplicate dispute'ları filtrele (aynı dispute ID'ye sahip olanları)
        const uniqueDisputes = customerDisputes.filter((dispute: any, index: number, self: any[]) => 
          index === self.findIndex((d: any) => d.disputeId === dispute.disputeId)
        );
        
        console.log('✅ Customer disputes loaded (before deduplication):', customerDisputes);
        console.log('✅ Customer disputes loaded (after deduplication):', uniqueDisputes);
        setDisputes(uniqueDisputes);
      } else {
        console.error('❌ Failed to load disputes:', response.status);
        setDisputes([]);
      }
    } catch (error) {
      console.error('❌ Error loading dispute data:', error);
      setDisputes([]);
    }
  };

  const loadPaymentData = async (customer: CustomerDetail, customerPayments: any[]) => {
    try {
      console.log('Loading payment data for customer:', customer);
      console.log('Customer payments from backend:', customerPayments);
      
      // Sort payments by createdAt (newest first - yeniden eskiye)
      const sortedPayments = customerPayments.sort((a: any, b: any) => {
        const dateA = new Date(a.createdAt || 0);
        const dateB = new Date(b.createdAt || 0);
        return dateB.getTime() - dateA.getTime(); // Newest first
      });
      
      console.log('Sorted payments (newest first):', sortedPayments.map((p: any) => ({
        paymentId: p.paymentId,
        status: p.status,
        createdAt: p.createdAt
      })));
      
      // Set payment intents (all payments for this customer with real status from backend)
      setPaymentIntents(sortedPayments.map((payment: any) => ({
        paymentId: payment.paymentId || payment.id,
        merchantId: payment.merchantId || 'TEST_MERCHANT',
        status: payment.status || 'PENDING', // Real status from backend - PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REFUNDED
        amount: payment.amount || 0,
        currency: payment.currency || 'USD',
        activeAttemptId: `pay_${Date.now()}_1`,
        business: 'NA',
        createdAt: payment.createdAt || new Date().toISOString()
      })));
      
      // Set payment attempts (all payments with real status from backend)
      setPaymentAttempts(sortedPayments.map((payment: any) => ({
        paymentId: payment.paymentId || payment.id,
        merchantId: payment.merchantId || 'TEST_MERCHANT',
        status: payment.status || 'PENDING', // Real status from backend - PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED, REFUNDED
        amount: payment.amount || 0,
        currency: payment.currency || 'USD',
        connector: 'fauxpay',
        paymentMethod: payment.paymentMethod || 'CREDIT_CARD',
        paymentType: 'cred',
        createdAt: payment.createdAt || new Date().toISOString()
      })));
      
      console.log('Payment intents with real status:', paymentIntents);
      console.log('Payment attempts with real status:', paymentAttempts);
      
      // Get refunds for this customer's payments using the same API as RefundsPage
      try {
        const refundsResponse = await dashboardAPI.getRefunds(currentMerchantId);
        const allRefunds = refundsResponse.refunds;
        
        // Filter refunds that belong to this customer's payments
        const customerRefunds = allRefunds.filter((refund: RefundListItem) => {
          return sortedPayments.some((payment: any) => 
            payment.paymentId === refund.paymentId || payment.id === refund.paymentId
          );
        });
        
        console.log('Filtered refunds for customer:', customerRefunds);
        
        setRefunds(customerRefunds);
      } catch (error) {
        console.error('Error loading refunds:', error);
        // Fallback to empty array if API fails
        setRefunds([]);
      }
      
    } catch (error) {
      console.error('Error loading payment data:', error);
    }
  };

  useEffect(() => {
    loadCustomerDetail();
  }, [customerId]);

  const handleSyncCustomer = async () => {
    if (!customerId) return;
    
    try {
      // Real-time sync from backend
      console.log('Syncing customer from backend:', customerId);
      await loadCustomerDetail();
    } catch (err: any) {
      setError(err.message || 'Failed to sync customer');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (value: any) => {
    try {
      if (!value) return '—';
      if (Array.isArray(value)) {
        const [y, m, d, hh = 0, mm = 0, ss = 0] = value;
        const dt = new Date(y, (m || 1) - 1, d || 1, hh, mm, ss);
        if (isNaN(dt.getTime())) return '—';
        return format(dt, 'MMM dd, yyyy HH:mm:ss');
      }
      if (typeof value === 'number') {
        const dt = new Date(value);
        if (isNaN(dt.getTime())) return '—';
        return format(dt, 'MMM dd, yyyy HH:mm:ss');
      }
      if (typeof value === 'string') {
        const normalized = value.includes('T') ? value : value.replace(' ', 'T');
        const dt = new Date(normalized);
        if (isNaN(dt.getTime())) return '—';
        return format(dt, 'MMM dd, yyyy HH:mm:ss');
      }
      return '—';
    } catch (error) {
      console.error('Error formatting date:', value, error);
      return '—';
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
        <Button onClick={() => navigate('/dashboard/customers')}>
          Back to Customers
        </Button>
      </Box>
    );
  }

  if (!customer) {
    return (
      <Box>
        <Alert severity="info">
          Customer not found
        </Alert>
        <Button onClick={() => navigate('/dashboard/customers')}>
          Back to Customers
        </Button>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => navigate('/dashboard/customers')}
            sx={{ mb: 1 }}
          >
            Customers
          </Button>
          <Typography variant="h4" gutterBottom>
            {customer.customerName || customer.customerId}
          </Typography>
        </Box>
        
        <Button
          variant="contained"
          startIcon={<Sync />}
          onClick={handleSyncCustomer}
        >
          Sync
        </Button>
        
        {/* Debug button for testing real-time data */}
        <Button
          variant="outlined"
          onClick={async () => {
            try {
              if (!customerId) { console.error('Debug: customerId missing'); return; }
              console.log('🔍 Debug: Fetching real-time payments...');
              const customerPayments = await dashboardAPI.getCustomerPayments(customerId as string);
              console.log('🔍 Debug: Customer payments from backend:', customerPayments);
              console.log('🔍 Debug: Customer payments:', customerPayments);
              console.log('🔍 Debug: Payment statuses:', customerPayments.map((p: any) => p.status));
              
              // Sort and show dates
              const sortedPayments = customerPayments.sort((a: any, b: any) => {
                const dateA = new Date(a.createdAt || 0);
                const dateB = new Date(b.createdAt || 0);
                return dateB.getTime() - dateA.getTime();
              });
              
              console.log('🔍 Debug: Sorted payments (newest first):', sortedPayments.map((p: any) => ({
                paymentId: p.paymentId,
                status: p.status,
                createdAt: p.createdAt,
                formattedDate: formatDate(p.createdAt)
              })));
              
              // Reload data
              await loadCustomerDetail();
            } catch (error) {
              console.error('Debug error:', error);
            }
          }}
          sx={{ ml: 1 }}
        >
          Debug Data
        </Button>
        
        {/* Create test payments button */}
        <Button
          variant="outlined"
          color="secondary"
          onClick={async () => {
            try {
              console.log('🧪 Creating test payments...');
              const response = await fetch('http://localhost:8080/mock/garanti/create-test-payments', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                }
              });
              
              if (response.ok) {
                const result = await response.json();
                console.log('🧪 Test payments created:', result);
                
                // Reload customer data to show new payments
                await loadCustomerDetail();
              } else {
                console.error('🧪 Failed to create test payments');
              }
            } catch (error) {
              console.error('Test payments error:', error);
            }
          }}
          sx={{ ml: 1 }}
        >
          Create Test Payments
        </Button>
      </Box>

      {/* Summary and About Customer */}
      <Box sx={{ 
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
        gap: 3,
        mb: 4,
        alignItems: 'stretch'
      }}>
        {/* Summary */}
        <Box sx={{ height: '100%' }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 64, height: 64, fontSize: '1.5rem' }}>
                  {customer.customerName ? getInitials(customer.customerName) : <Person />}
                </Avatar>
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 'bold' }}>
                    {customer.customerName || 'N/A'}
                  </Typography>
                </Box>
              </Box>
              
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Summary
              </Typography>
              
              <Box sx={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 2,
                flex: 1
              }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Customer ID
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {customer.customerId}
                    </Typography>
                    <Tooltip title="Copy">
                      <IconButton 
                        size="small" 
                        onClick={() => copyToClipboard(customer.customerId)}
                      >
                        <ContentCopy fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Created
                  </Typography>
                  <Typography variant="body2">
                    {formatDate(customer.createdAt)}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* About Customer */}
        <Box sx={{ height: '100%' }}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                About Customer
              </Typography>
              
              <Box sx={{ 
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: 2,
                flex: 1
              }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Email
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Email fontSize="small" color="action" />
                    <Typography variant="body2">
                      {customer.email}
                    </Typography>
                  </Box>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Phone
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Phone fontSize="small" color="action" />
                    <Typography variant="body2">
                      {customer.phoneCountryCode && customer.phone 
                        ? `${customer.phoneCountryCode} ${customer.phone}`
                        : 'N/A'
                      }
                    </Typography>
                  </Box>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Description
                  </Typography>
                  <Typography variant="body2">
                    {customer.description || 'N/A'}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Address
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LocationOn fontSize="small" color="action" />
                    <Typography variant="body2">
                      {customer.address || 'N/A'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Payment Intents Table */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
            Payment Intents
          </Typography>
          
          <TableContainer component={Paper} variant="outlined" sx={{ 
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider'
          }}>
            <Table>
              <TableHead>
                <TableRow sx={{ 
                  backgroundColor: 'background.paper',
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Payment Id</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Merchant Id</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Status</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Amount</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Currency</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Created Date</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Active Attempt Id</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Business</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentIntents.length > 0 ? (
                  paymentIntents.map((intent) => (
                    <TableRow key={intent.paymentId} sx={{ 
                      backgroundColor: 'background.paper',
                      borderBottom: '1px solid',
                      borderColor: 'divider'
                    }}>
                      <TableCell>{intent.paymentId}</TableCell>
                      <TableCell>{intent.merchantId}</TableCell>
                      <TableCell>
                        <StatusChip status={intent.status as CustomerStatus} />
                      </TableCell>
                      <TableCell>{formatAmount(intent.amount, intent.currency)}</TableCell>
                      <TableCell>{intent.currency}</TableCell>
                      <TableCell>{intent.createdAt ? formatDate(intent.createdAt) : 'N/A'}</TableCell>
                      <TableCell>{intent.activeAttemptId}</TableCell>
                      <TableCell>{intent.business}</TableCell>
                      <TableCell>
                        <Tooltip title="View Payment Details">
                          <IconButton 
                            size="small"
                            onClick={() => navigate(`/dashboard/payments/${intent.paymentId}`)}
                          >
                            <OpenInNew fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow sx={{ 
                    backgroundColor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                  }}>
                    <TableCell colSpan={9} sx={{ textAlign: 'center', py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No payment intents found for this customer
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Payment Attempts Table */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
            Payment Attempts
          </Typography>
          
          <TableContainer component={Paper} variant="outlined" sx={{ 
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider'
          }}>
            <Table>
              <TableHead>
                <TableRow sx={{ 
                  backgroundColor: 'background.paper',
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Payment ID</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Merchant ID</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Status</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Amount</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Currency</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Created Date</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Connector</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Payment Method</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Payment Type</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paymentAttempts.length > 0 ? (
                  paymentAttempts.map((attempt) => (
                    <TableRow key={attempt.paymentId} sx={{ 
                      backgroundColor: 'background.paper',
                      borderBottom: '1px solid',
                      borderColor: 'divider'
                    }}>
                      <TableCell>{attempt.paymentId}</TableCell>
                      <TableCell>{attempt.merchantId}</TableCell>
                      <TableCell>
                        <StatusChip status={attempt.status as CustomerStatus} />
                      </TableCell>
                      <TableCell>{formatAmount(attempt.amount, attempt.currency)}</TableCell>
                      <TableCell>{attempt.currency}</TableCell>
                      <TableCell>{attempt.createdAt ? formatDate(attempt.createdAt) : 'N/A'}</TableCell>
                      <TableCell>{attempt.connector}</TableCell>
                      <TableCell>{attempt.paymentMethod}</TableCell>
                      <TableCell>{attempt.paymentType}</TableCell>
                      <TableCell>
                        <Tooltip title="View Payment Details">
                          <IconButton 
                            size="small"
                            onClick={() => navigate(`/dashboard/payments/${attempt.paymentId}`)}
                          >
                            <OpenInNew fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow sx={{ 
                    backgroundColor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                  }}>
                    <TableCell colSpan={10} sx={{ textAlign: 'center', py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No payment attempts found for this customer
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Refunds Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
            Refunds
          </Typography>
          
          <TableContainer component={Paper} variant="outlined" sx={{ 
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider'
          }}>
            <Table>
              <TableHead>
                <TableRow sx={{ 
                  backgroundColor: 'background.paper',
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Refund ID</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Payment ID</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Status</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Amount</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Currency</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Reason</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Refund Date</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {refunds.length > 0 ? (
                  refunds.map((refund) => (
                    <TableRow key={refund.refundId} sx={{ 
                      backgroundColor: 'background.paper',
                      borderBottom: '1px solid',
                      borderColor: 'divider'
                    }}>
                      <TableCell>{refund.refundId}</TableCell>
                      <TableCell>{refund.paymentId}</TableCell>
                      <TableCell>
                        <StatusChip status={refund.status} />
                      </TableCell>
                      <TableCell>{formatAmount(refund.amount, refund.currency)}</TableCell>
                      <TableCell>{refund.currency}</TableCell>
                      <TableCell>{refund.reason}</TableCell>
                      <TableCell>{formatDate(refund.createdAt)}</TableCell>
                      <TableCell>
                        <Tooltip title="View Refund Details">
                          <IconButton 
                            size="small"
                            onClick={() => navigate(`/dashboard/refunds/${refund.refundId}`)}
                          >
                            <OpenInNew fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow sx={{ 
                    backgroundColor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                  }}>
                    <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No refunds found for this customer
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Disputes Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 600, mb: 3 }}>
            Disputes
          </Typography>
          
          <TableContainer component={Paper} variant="outlined" sx={{ 
            backgroundColor: 'background.paper',
            border: '1px solid',
            borderColor: 'divider'
          }}>
            <Table>
              <TableHead>
                <TableRow sx={{ 
                  backgroundColor: 'background.paper',
                  borderBottom: '1px solid',
                  borderColor: 'divider'
                }}>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Dispute ID</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Payment ID</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Status</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Amount</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Currency</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Reason</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Dispute Date</TableCell>
                  <TableCell sx={{ 
                    fontWeight: 600,
                    color: 'text.primary',
                    backgroundColor: 'background.paper'
                  }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {disputes.length > 0 ? (
                  disputes.map((dispute) => (
                    <TableRow key={dispute.disputeId} sx={{ 
                      backgroundColor: 'background.paper',
                      borderBottom: '1px solid',
                      borderColor: 'divider'
                    }}>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{dispute.disputeId}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{dispute.paymentId}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color={
                            dispute.status === 'WON' ? 'success' :
                            dispute.status === 'LOST' ? 'error' :
                            dispute.status === 'UNDER_REVIEW' ? 'warning' :
                            dispute.status === 'EVIDENCE_REQUIRED' ? 'info' :
                            dispute.status === 'OPENED' ? 'primary' :
                            'default'
                          }
                          label={
                            dispute.status === 'OPENED' ? 'Açıldı' :
                            dispute.status === 'UNDER_REVIEW' ? 'İnceleme Altında' :
                            dispute.status === 'EVIDENCE_REQUIRED' ? 'Kanıt Gerekli' :
                            dispute.status === 'RESOLVED' ? 'Çözüldü' :
                            dispute.status === 'CLOSED' ? 'Kapatıldı' :
                            dispute.status === 'WON' ? 'Kazanıldı' :
                            dispute.status === 'LOST' ? 'Kaybedildi' :
                            dispute.status
                          }
                        />
                      </TableCell>
                      <TableCell>{formatAmount(dispute.amount, dispute.currency)}</TableCell>
                      <TableCell>{dispute.currency}</TableCell>
                      <TableCell>
                        {dispute.reason === 'FRAUD' ? 'Dolandırıcılık' :
                         dispute.reason === 'DUPLICATE' ? 'Duplike İşlem' :
                         dispute.reason === 'PRODUCT_NOT_RECEIVED' ? 'Ürün Teslim Alınmadı' :
                         dispute.reason === 'PRODUCT_NOT_AS_DESCRIBED' ? 'Ürün Açıklaması Uygun Değil' :
                         dispute.reason === 'CREDIT_NOT_PROCESSED' ? 'Kredi İşlenmedi' :
                         dispute.reason === 'GENERAL' ? 'Genel' :
                         dispute.reason === 'OTHER' ? 'Diğer' :
                         dispute.reason}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          try {
                            if (!dispute.disputeDate) return 'Belirtilmemiş';
                            if (Array.isArray(dispute.disputeDate)) {
                              const [year, month, day, hour = 0, minute = 0] = dispute.disputeDate;
                              const date = new Date(year, month - 1, day, hour, minute);
                              return format(date, 'dd.MM.yyyy HH:mm');
                            }
                            return format(new Date(dispute.disputeDate), 'dd.MM.yyyy HH:mm');
                          } catch (error) {
                            return 'Geçersiz tarih';
                          }
                        })()}
                      </TableCell>
                      <TableCell>
                        <Tooltip title="View Dispute Details">
                          <IconButton 
                            size="small"
                            onClick={() => navigate(`/dashboard/disputes/${dispute.disputeId}`)}
                          >
                            <OpenInNew fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow sx={{ 
                    backgroundColor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'divider'
                  }}>
                    <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No disputes found for this customer
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CustomerDetailPage;