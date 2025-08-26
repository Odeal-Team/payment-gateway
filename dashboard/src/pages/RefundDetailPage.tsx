import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
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
} from '@mui/material';
import {
  ArrowBack,
  Sync,
  ExpandMore,
  Info,
  Warning,
  Error as ErrorIcon,
  CheckCircle,
} from '@mui/icons-material';
import { useParams, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { dashboardAPI } from '../services/dashboardApi';
import { RefundDetail, RefundEvent, RefundLog } from '../types/dashboard';
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

const RefundDetailPage: React.FC = () => {
  const { refundId } = useParams<{ refundId: string }>();
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  
  const [refund, setRefund] = useState<RefundDetail | null>(null);
  const [events, setEvents] = useState<RefundEvent[]>([]);
  const [logs, setLogs] = useState<RefundLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);

  const loadRefundDetail = async () => {
    if (!refundId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Real API calls
      const refundDetail = await dashboardAPI.getRefundDetail(refundId);
      
      setRefund(refundDetail);
      setEvents(refundDetail.events || []);
      setLogs(refundDetail.logs || []);
      
    } catch (err: any) {
      console.error('Error loading refund detail:', err);
      setError(err.message || 'Failed to load refund details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRefundDetail();
  }, [refundId]);

  const handleSyncRefund = async () => {
    if (!refundId) return;
    
    try {
      // TODO: Implement sync
      console.log('Syncing refund:', refundId);
      loadRefundDetail();
    } catch (err: any) {
      setError(err.message || 'Failed to sync refund');
    }
  };

  const handleSimulateRefundWebhook = async () => {
    if (!refund?.refundId) {
      alert('Refund ID not found for this refund');
      return;
    }
    
    try {
      setLoading(true);
      console.log('🏦 Simulating refund webhook for refund:', refund.refundId);
      
      // Call the refund webhook simulation API
      await dashboardAPI.simulateRefundWebhook(refund.refundId);
      
      // Show success message
      alert('✅ Refund completed successfully! Bank webhook simulated.');
      
      // Refresh refund details to show updated status
      loadRefundDetail();
      
    } catch (err: any) {
      console.error('❌ Error simulating refund webhook:', err);
      alert(`Failed to complete refund: ${err.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };
  const formatAmount = (amount: number, currency: string) => {
    if (currency === 'TRY') {
      return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
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

  const getReasonLabel = (reason: string) => {
    return reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
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
        <Button onClick={() => navigate('/dashboard/refunds')}>
          Back to Refunds
        </Button>
      </Box>
    );
  }

  if (!refund) {
    return (
      <Box>
        <Alert severity="info">
          Refund not found
        </Alert>
        <Button onClick={() => navigate('/dashboard/refunds')}>
          Back to Refunds
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
            onClick={() => navigate('/dashboard/refunds')}
            sx={{ mb: 1 }}
          >
            Refunds
          </Button>
          <Typography variant="h4" gutterBottom>
            {refund.refundId}
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 2 }}>
          {/* Complete Refund Button - Only show for PROCESSING status */}
          {refund.status === 'PROCESSING' && (
            <Box sx={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center',
              p: 2,
              bgcolor: 'warning.50',
              borderRadius: 2,
              border: '2px dashed',
              borderColor: 'warning.main',
              minWidth: 200
            }}>
              <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600, mb: 1 }}>
                ⏳ REFUND STUCK
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', mb: 1 }}>
                Status: PROCESSING
              </Typography>
              <Button
                variant="contained"
                color="success"
                startIcon={<CheckCircle />}
                onClick={handleSimulateRefundWebhook}
                disabled={loading}
                fullWidth
                sx={{ 
                  fontWeight: 'bold',
                  boxShadow: 2,
                  '&:hover': {
                    boxShadow: 4,
                    transform: 'translateY(-1px)'
                  }
                }}
              >
                🏦 Complete Now
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, textAlign: 'center' }}>
                Simulate bank webhook
              </Typography>
            </Box>
          )}
          
          <Button
            variant="contained"
            startIcon={<Sync />}
            onClick={handleSyncRefund}
          >
            Sync
          </Button>
        </Box>
      </Box>

      {/* Summary and About Refund */}
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
                  {formatAmount(refund.amount, refund.currency)}
                </Typography>
                <StatusChip status={refund.status} size="medium" />
              </Box>
              
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                Summary
              </Typography>
              
              <Box sx={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 2 
              }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Created
                  </Typography>
                  <Typography variant="body2">
                    {formatDate(refund.createdAt)}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Refund Date
                  </Typography>
                  <Typography variant="body2">
                    {formatDate(refund.refundDate)}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Amount Refunded
                  </Typography>
                  <Typography variant="body2">
                    {formatAmount(refund.amount, refund.currency)}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Refund ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {refund.refundId}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Payment ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {refund.paymentId}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Gateway Refund ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {refund.gatewayRefundId || 'N/A'}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* About Refund */}
        <Box>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 600 }}>
                About Refund
              </Typography>
              
              <Box sx={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 2 
              }}>
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Merchant ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {refund.merchantId}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Customer ID
                  </Typography>
                  <Typography variant="body2">
                    {refund.customerId}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Transaction ID
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {refund.transactionId}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Currency
                  </Typography>
                  <Typography variant="body2">
                    {refund.currency}
                  </Typography>
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Refund Reason
                  </Typography>
                  <Chip
                    label={getReasonLabel(refund.reason)}
                    size="small"
                    variant="outlined"
                    color="primary"
                  />
                </Box>
                
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Status
                  </Typography>
                  <StatusChip status={refund.status} />
                </Box>
              </Box>

              {refund.description && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Description
                  </Typography>
                  <Typography variant="body2">
                    {refund.description}
                  </Typography>
                </Box>
              )}
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
                {events.map((event, index) => (
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
                          label="200" 
                          size="small" 
                          color="success" 
                          variant="outlined"
                        />
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          POST
                        </Typography>
                        <Typography variant="body2">
                          {event.eventType.replace('_', ' ')}
                        </Typography>
                      </Box>
                      
                      <Typography variant="caption" color="text.secondary">
                        {formatDate(event.timestamp)}
                      </Typography>
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
                      <TableCell>Refund Id</TableCell>
                      <TableCell>Request Id</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell>Message</TableCell>
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
                          {log.refundId || 'N/A'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {log.requestId || 'N/A'}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {log.source || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {log.message}
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
            <Typography variant="body2">
              Request data will be displayed here...
            </Typography>
          </TabPanel>
          
          <TabPanel value={tabValue} index={2}>
            <Typography variant="body2">
              Response data will be displayed here...
            </Typography>
          </TabPanel>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};

export default RefundDetailPage;