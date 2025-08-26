import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  InputAdornment,
} from '@mui/material';
import {
  ArrowBack,
  Sync,
  Undo,
  ExpandMore,
  Info,
  Warning,
  Error as ErrorIcon,
  CheckCircle,
  ContentCopy,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

import { useAuth } from '../contexts/AuthContext';
import { dashboardAPI } from '../services/dashboardApi';
import { PaymentDetail, PaymentEvent, PaymentLog, PaymentStatus, PaymentMethod, RefundReason } from '../types/dashboard';
import StatusChip from '../components/common/StatusChip';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index, ...other }) => {
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
};

const PaymentDetailPage: React.FC = () => {
  const { paymentId } = useParams<{ paymentId: string }>();
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [logs, setLogs] = useState<PaymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  
  // Refund dialog state
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('CUSTOMER_REQUEST');
  const [refundLoading, setRefundLoading] = useState(false);
  const [existingRefunds, setExistingRefunds] = useState<any[]>([]);
  const [totalRefundedAmount, setTotalRefundedAmount] = useState(0);

  const loadPaymentDetail = async () => {
    if (!paymentId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Real API calls
      const paymentDetail = await dashboardAPI.getPaymentDetail(paymentId);
      const eventsAndLogs = await dashboardAPI.getPaymentEvents(paymentId);
      
      setPayment(paymentDetail);
      setEvents(paymentDetail.events || eventsAndLogs.events || []);
      setLogs(paymentDetail.logs || eventsAndLogs.logs || []);
      
      // Load existing refunds for this payment
      try {
        const refundsResponse = await dashboardAPI.getRefunds(authState.user!.merchantId);
        const paymentRefunds = refundsResponse.refunds.filter(refund => refund.paymentId === paymentId);
        setExistingRefunds(paymentRefunds);
        
        // Calculate total refunded amount (only for completed refunds)
        const totalRefunded = paymentRefunds
          .filter(refund => refund.status === 'COMPLETED')
          .reduce((sum, refund) => sum + refund.amount, 0);
        setTotalRefundedAmount(totalRefunded);
        
        // Create refund events and add them to the events timeline
        const refundEvents: PaymentEvent[] = paymentRefunds.map(refund => ({
          id: `refund-${refund.id}`,
          eventType: `REFUND_${refund.status}`,
          timestamp: refund.createdAt,
          status: refund.status === 'COMPLETED' ? 'SUCCESS' as const : 
                  refund.status === 'FAILED' ? 'FAILED' as const : 'INFO' as const,
          message: `Refund ${refund.status.toLowerCase()} - ${refund.amount} ${refund.currency}`,
          details: {
            refundId: refund.refundId,
            amount: refund.amount,
            reason: refund.reason,
            description: refund.description
          }
        }));
        
        // Combine payment events with refund events and sort by timestamp
        const allEvents = [...(paymentDetail.events || eventsAndLogs.events || []), ...refundEvents]
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        setEvents(allEvents);
        
        // Create refund logs and add them to the logs list
        const refundLogs: PaymentLog[] = paymentRefunds.map(refund => ({
          id: `refund-log-${refund.id}`,
          level: refund.status === 'FAILED' ? 'ERROR' as const : 'INFO' as const,
          timestamp: refund.createdAt,
          message: `Refund ${refund.status.toLowerCase()} for ${refund.amount} ${refund.currency}`,
          source: 'API' as const,
          merchantId: refund.merchantId,
          paymentId: refund.paymentId,
          refundId: refund.refundId,
          apiAuthType: 'API_KEY',
          urlPath: `/v1/refunds`,
          details: {
            refundId: refund.refundId,
            amount: refund.amount,
            currency: refund.currency,
            reason: refund.reason,
            status: refund.status
          }
        }));
        
        // Combine payment logs with refund logs and sort by timestamp
        const allLogs = [...(paymentDetail.logs || eventsAndLogs.logs || []), ...refundLogs]
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        
        setLogs(allLogs);
        
      } catch (refundErr) {
        console.error('Error loading refunds:', refundErr);
        // Don't fail the whole page if refunds can't be loaded
        setExistingRefunds([]);
        setTotalRefundedAmount(0);
        setEvents(paymentDetail.events || eventsAndLogs.events || []);
        setLogs(paymentDetail.logs || eventsAndLogs.logs || []);
      }
      
    } catch (err: any) {
      console.error('Error loading payment detail:', err);
      setError(err.message || 'Failed to load payment details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPaymentDetail();
  }, [paymentId]);

  const handleSyncPayment = async () => {
    if (!paymentId) return;
    
    try {
      // TODO: Implement sync
      // await dashboardAPI.syncPaymentStatus(paymentId);
      console.log('Syncing payment:', paymentId);
      loadPaymentDetail();
    } catch (err: any) {
      setError(err.message || 'Failed to sync payment');
    }
  };

  const handleSimulateBankWebhook = async () => {
    if (!payment?.transactionId) {
      alert('Transaction ID not found for this payment');
      return;
    }
    
    try {
      setLoading(true);
      console.log('🏦 Simulating bank webhook for transaction:', payment.transactionId);
      
      // Call the bank webhook simulation API
      await dashboardAPI.simulateBankWebhook(payment.transactionId);
      
      // Show success message
      alert('✅ Payment completed successfully! Bank webhook simulated.');
      
      // Refresh payment details to show updated status
      loadPaymentDetail();
      
    } catch (err: any) {
      console.error('❌ Error simulating bank webhook:', err);
      alert(`Failed to complete payment: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessRefund = () => {
    if (!payment) return;
    
    // Open refund dialog with available amount pre-filled
    const availableAmount = payment.amount - totalRefundedAmount;
    setRefundAmount(availableAmount.toString());
    setRefundDialogOpen(true);
  };

  const handleRefundSubmit = async () => {
    if (!payment || !refundAmount) return;
    
    setRefundLoading(true);
    try {
      const refundAmountNum = parseFloat(refundAmount);
      
      // Validation: Check if refund amount is valid
      if (refundAmountNum <= 0) {
        throw new Error('Refund amount must be greater than 0');
      }
      
      // Validation: Check if refund amount exceeds available amount
      const availableAmount = payment.amount - totalRefundedAmount;
      if (refundAmountNum > availableAmount) {
        throw new Error(`Refund amount cannot exceed available amount: ${availableAmount.toFixed(2)} ${payment.currency}`);
      }
      
      const refundRequest = {
        paymentId: payment.paymentId,
        transactionId: payment.transactionId,
        merchantId: payment.merchantId,
        customerId: payment.customerId,
        amount: refundAmountNum,
        currency: payment.currency,
        reason: refundReason as RefundReason,
        description: `Refund for payment ${payment.paymentId}`
      };
      
      await dashboardAPI.createRefund(refundRequest);
      
      // Close dialog and show success
      setRefundDialogOpen(false);
      setRefundAmount('');
      alert('Refund processed successfully!');
      
      // Refresh payment details
      loadPaymentDetail();
      
    } catch (err: any) {
      console.error('Error processing refund:', err);
      alert(err.message || 'Failed to process refund');
    } finally {
      setRefundLoading(false);
    }
  };

  const handleCopyToClipboard = (data: any, type: string) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      .then(() => {
        alert(`${type} copied to clipboard!`);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy to clipboard');
      });
  };

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM dd, yyyy HH:mm:ss');
  };

  const getEventIcon = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <CheckCircle color="success" />;
      case 'FAILED':
        return <ErrorIcon color="error" />;
      case 'INFO':
        return <Info color="info" />;
      default:
        return <Warning color="warning" />;
    }
  };

  const getLogLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'error';
      case 'WARN':
        return 'warning';
      case 'INFO':
      default:
        return 'info';
    }
  };

  const formatPaymentRequest = (payment: PaymentDetail) => {
    return {
      amount: {
        value: payment.amount * 100, // Convert to cents
        currency: payment.currency
      },
      payment_id: payment.paymentId,
      merchant_id: payment.merchantId,
      customer_id: payment.customerId,
      description: payment.description || "Payment via Payment Gateway",
      payment_method: payment.paymentMethod,
      card: {
        number: payment.cardNumber,
        holder_name: payment.cardHolderName,
        brand: payment.cardBrand || "Unknown",
        bin: payment.cardBin || "N/A",
        last_four: payment.cardLastFour || payment.cardNumber?.slice(-4)
      },
      capture_method: "automatic",
      authentication_type: "no_three_ds",
      confirm: true,
      return_url: `${window.location.origin}/dashboard/payments/${payment.paymentId}`,
      metadata: {
        transaction_id: payment.transactionId,
        created_at: payment.createdAt,
        gateway_transaction_id: payment.gatewayTransactionId
      },
      billing: {
        name: payment.cardHolderName,
        email: `${payment.customerId}@example.com`
      }
    };
  };

  const formatPaymentResponse = (payment: PaymentDetail) => {
    return {
      payment_id: payment.paymentId,
      merchant_id: payment.merchantId,
      status: payment.status.toLowerCase(),
      amount: payment.amount * 100, // Convert to cents
      net_amount: payment.amount * 100,
      amount_capturable: payment.status === PaymentStatus.COMPLETED ? payment.amount * 100 : 0,
      amount_received: payment.status === PaymentStatus.COMPLETED ? payment.amount * 100 : null,
      currency: payment.currency,
      customer_id: payment.customerId,
      customer: {
        id: payment.customerId,
        name: payment.cardHolderName,
        email: `${payment.customerId}@example.com`
      },
      description: payment.description || "Payment via Payment Gateway",
      created: payment.createdAt,
      updated: payment.updatedAt,
      completed_at: payment.completedAt,
      capture_method: "automatic",
      payment_method: payment.paymentMethod.toLowerCase(),
      payment_method_data: {
        card: {
          number: payment.cardNumber,
          holder_name: payment.cardHolderName,
          brand: payment.cardBrand || "Unknown",
          bin: payment.cardBin || "N/A",
          last_four: payment.cardLastFour || payment.cardNumber?.slice(-4)
        }
      },
      connector_transaction_id: payment.gatewayTransactionId,
      gateway_response: payment.gatewayResponse,
      attempt_count: 1,
      authentication_type: "no_three_ds",
      error_code: payment.status === PaymentStatus.FAILED ? "PAYMENT_FAILED" : null,
      error_message: payment.status === PaymentStatus.FAILED ? "Payment processing failed" : null,
      expires_on: null,
      fingerprint: null,
      metadata: {
        transaction_id: payment.transactionId,
        processed_at: new Date().toISOString(),
        gateway: "payment-gateway-v1"
      },
      refunds: existingRefunds.map(refund => ({
        refund_id: refund.refundId,
        amount: refund.amount * 100,
        currency: refund.currency,
        status: refund.status.toLowerCase(),
        reason: refund.reason,
        created_at: refund.createdAt
      }))
    };
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
        <Button onClick={() => navigate('/dashboard/payments')}>
          Back to Payments
        </Button>
      </Box>
    );
  }

  if (!payment) {
    return (
      <Box>
        <Alert severity="info">
          Payment not found
        </Alert>
        <Button onClick={() => navigate('/dashboard/payments')}>
          Back to Payments
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
            onClick={() => navigate('/dashboard/payments')}
            sx={{ mb: 1 }}
          >
            Payments
          </Button>
          <Typography variant="h4" gutterBottom>
            {payment.paymentId}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          {/* Bank Webhook Simulation Button - Only show for PROCESSING status */}
          {payment.status === 'PROCESSING' && (
            <Button
              variant="contained"
              color="success"
              startIcon={<CheckCircle />}
              onClick={handleSimulateBankWebhook}
              disabled={loading}
            >
              Complete Payment
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<Undo />}
            onClick={handleProcessRefund}
            disabled={payment.status !== 'COMPLETED'}
          >
            Process Refund
          </Button>
          
          <Button
            variant="contained"
            startIcon={<Sync />}
            onClick={handleSyncPayment}
          >
            Sync
          </Button>
        </Box>
      </Box>

      {/* Summary and About Payment */}
      <Box sx={{ 
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' },
        gap: 3,
        mb: 4 
      }}>
        {/* Summary */}
        <Box>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <Typography variant="h3" sx={{ fontWeight: 'bold' }}>
                  {formatAmount(payment.amount, payment.currency)}
                </Typography>
                <StatusChip status={payment.status} size="medium" />
              </Box>
              
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Summary
              </Typography>
              
              <Box sx={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 2 
              }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Created
                  </Typography>
                  <Typography variant="body2">
                    {formatDate(payment.createdAt)}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Last Updated
                  </Typography>
                  <Typography variant="body2">
                    {formatDate(payment.updatedAt)}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Amount Received
                  </Typography>
                  <Typography variant="body2">
                    {payment.status === PaymentStatus.COMPLETED ? formatAmount(payment.amount, payment.currency) : '$0.00'}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Payment ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {payment.paymentId}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Transaction ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {payment.transactionId || 'N/A'}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Connector Transaction ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {payment.gatewayTransactionId || 'N/A'}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Error Message
                  </Typography>
                  <Typography variant="body2">
                    {payment.status === PaymentStatus.FAILED ? 'Payment failed' : 'N/A'}
                  </Typography>
                </Box>
              </Box>
              
              {/* Refund Button */}
              {payment.status === PaymentStatus.COMPLETED && (payment.amount - totalRefundedAmount) > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Button
                    variant="outlined"
                    color="warning"
                    startIcon={<Undo />}
                    onClick={handleProcessRefund}
                    fullWidth
                  >
                    Process Refund
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                    Available: {formatAmount(payment.amount - totalRefundedAmount, payment.currency)}
                  </Typography>
                </Box>
              )}
              
              {/* Show message if fully refunded */}
              {payment.status === PaymentStatus.COMPLETED && (payment.amount - totalRefundedAmount) <= 0 && (
                <Box sx={{ mt: 3 }}>
                  <Alert severity="info">
                    This payment has been fully refunded.
                  </Alert>
                </Box>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* About Payment */}
        <Box>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                About Payment
              </Typography>
              
              <Box sx={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 2 
              }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Profile Id
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {payment.merchantId}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Profile Name
                  </Typography>
                  <Typography variant="body2">
                    default
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Preferred connector
                  </Typography>
                  <Typography variant="body2">
                    NA
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Connector Label
                  </Typography>
                  <Typography variant="body2">
                    NA
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Payment Method Type
                  </Typography>
                  <Typography variant="body2">
                    NA
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Payment Method
                  </Typography>
                  <Typography variant="body2">
                    {payment.paymentMethod.replace('_', ' ')}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Auth Type
                  </Typography>
                  <Typography variant="body2">
                    three_ds
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Card Network
                  </Typography>
                  <Typography variant="body2">
                    {payment.cardBrand || 'NA'}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Events and Logs */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Events and logs
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
              <Tab label="Log Details" />
              <Tab label="Request" />
              <Tab label="Response" />
            </Tabs>
          </Box>
          
          <TabPanel value={tabValue} index={0}>
            {/* Events Timeline */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                API Events
              </Typography>
              
              <Box sx={{ pl: 2 }}>
                {events.map((event: PaymentEvent, index: number) => (
                  <Box key={event.id} sx={{ display: 'flex', gap: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {getEventIcon(event.status)}
                      {index < events.length - 1 && (
                        <Box sx={{ width: 2, height: 40, bgcolor: 'divider', mt: 1 }} />
                      )}
                    </Box>
                    
                    <Box sx={{ flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                        <Chip 
                          label={event.eventType.startsWith('REFUND_') ? 'REFUND' : '200'} 
                          size="small" 
                          color={event.eventType.startsWith('REFUND_') ? 
                            (event.status === 'SUCCESS' ? 'warning' : 
                             event.status === 'FAILED' ? 'error' : 'info') : 'success'} 
                          variant="outlined"
                        />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {event.eventType.startsWith('REFUND_') ? 'REFUND' : 'POST'}
                        </Typography>
                        <Typography variant="body2">
                          {event.eventType.replace('_', ' ')}
                        </Typography>
                      </Box>
                      
                      {/* Event Message */}
                      <Typography variant="body2" sx={{ mb: 0.5 }}>
                        {event.message}
                      </Typography>
                      
                      {/* Event Details for Refunds */}
                      {event.eventType.startsWith('REFUND_') && event.details && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                          Refund ID: {event.details.refundId} | Reason: {event.details.reason}
                        </Typography>
                      )}
                      
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            {/* Logs Table */}
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Request Logs
              </Typography>
              
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Merchant Id</TableCell>
                      <TableCell>Payment Id</TableCell>
                      <TableCell>Request Id</TableCell>
                      <TableCell>Api Auth Type</TableCell>
                      <TableCell>Authentication Data</TableCell>
                      <TableCell>Latency</TableCell>
                      <TableCell>Url Path</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {log.merchantId || 'N/A'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {log.paymentId || 'N/A'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {log.requestId || 'N/A'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {log.apiAuthType || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {JSON.stringify(log.details || {}, null, 2)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {log.latency || 'N/A'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {log.urlPath || 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </TabPanel>
          
          <TabPanel value={tabValue} index={1}>
            <Box sx={{ 
              p: 2, 
              backgroundColor: 'background.paper', 
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider'
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Payment Request
                </Typography>
                <Button
                  size="small"
                  startIcon={<ContentCopy />}
                  onClick={() => handleCopyToClipboard(formatPaymentRequest(payment), 'Request')}
                >
                  Copy
                </Button>
              </Box>
              <pre style={{ 
                backgroundColor: 'transparent',
                padding: '16px', 
                borderRadius: '8px', 
                overflow: 'auto',
                fontSize: '12px', 
                border: '1px solid',
                borderColor: 'var(--border)',
                color: 'var(--text)'
              }}>
                {JSON.stringify(formatPaymentRequest(payment), null, 2)}
              </pre>
            </Box>
          </TabPanel>
          
          <TabPanel value={tabValue} index={2}>
            <Box sx={{ 
              p: 2, 
              backgroundColor: 'background.paper', 
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider'
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Payment Response
                </Typography>
                <Button
                  size="small"
                  startIcon={<ContentCopy />}
                  onClick={() => handleCopyToClipboard(formatPaymentResponse(payment), 'Response')}
                >
                  Copy
                </Button>
              </Box>
              <pre style={{ 
                backgroundColor: 'transparent',
                padding: '16px', 
                borderRadius: '8px', 
                overflow: 'auto',
                fontSize: '12px',
                border: '1px solid',
                borderColor: 'var(--border)',
                color: 'var(--text)'
              }}>
                {JSON.stringify(formatPaymentResponse(payment), null, 2)}
              </pre>
            </Box>
          </TabPanel>
        </AccordionDetails>
      </Accordion>
      
      {/* Refund Dialog */}
      <Dialog 
        open={refundDialogOpen} 
        onClose={() => setRefundDialogOpen(false)}
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>Process Refund</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Payment ID: {payment?.paymentId}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Original Amount: {payment && formatAmount(payment.amount, payment.currency)}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              Already Refunded: {payment && formatAmount(totalRefundedAmount, payment.currency)}
            </Typography>
            <Typography variant="body2" color="primary.main" gutterBottom sx={{ fontWeight: 600 }}>
              Available for Refund: {payment && formatAmount(payment.amount - totalRefundedAmount, payment.currency)}
            </Typography>
            
            <TextField
              fullWidth
              label="Refund Amount"
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start">{payment?.currency}</InputAdornment>,
              }}
              sx={{ mt: 2, mb: 2 }}
              inputProps={{
                min: 0,
                max: payment ? payment.amount - totalRefundedAmount : 0,
                step: 0.01
              }}
              helperText={`Maximum refundable amount: ${payment ? formatAmount(payment.amount - totalRefundedAmount, payment.currency) : '0'}`}
            />
            
            <TextField
              fullWidth
              select
              label="Refund Reason"
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              SelectProps={{
                native: true,
              }}
            >
              <option value="CUSTOMER_REQUEST">Customer Request</option>
              <option value="MERCHANT_REQUEST">Merchant Request</option>
              <option value="DUPLICATE_PAYMENT">Duplicate Payment</option>
              <option value="FRAUD">Fraud</option>
              <option value="TECHNICAL_ERROR">Technical Error</option>
              <option value="OTHER">Other</option>
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setRefundDialogOpen(false)}
            disabled={refundLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleRefundSubmit}
            variant="contained"
            color="warning"
            disabled={refundLoading || !refundAmount || parseFloat(refundAmount) <= 0}
          >
            {refundLoading ? <CircularProgress size={20} /> : 'Process Refund'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PaymentDetailPage;