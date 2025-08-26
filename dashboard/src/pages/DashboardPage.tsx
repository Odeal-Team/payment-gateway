import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  Tooltip,
  Collapse,
  ButtonGroup,
} from '@mui/material';
import {
  CreditCard,
  AccountBalance,
  Group,
  MoneyOff,
} from '@mui/icons-material';
import StatsCards, { StatsCard } from '../components/common/StatsCards';
import { dashboardApi } from '../services/dashboardApi';
import { useAuth } from '../contexts/AuthContext';
import {
  CheckCircle,
  Paid,
  HourglassBottom,
  ReceiptLong,
  ReplayCircleFilled,
  GroupAdd,
  Star,
  ErrorOutline,
} from '@mui/icons-material';

interface DashboardStats {
  totalPayments: number;
  totalAmount: number;
  successRate: number;
  pendingPayments: number;
  totalRefunds: number;
  refundAmount: number;
  totalCustomers: number;
  totalDisputes: number;
  pendingDisputes: number;
  disputeRate: number;
}

const DashboardPage: React.FC = () => {
  const { state: authState } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expand, setExpand] = useState({ payments: false, refunds: false, customers: false, disputes: false });

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch dashboard stats from backend
      const response = await dashboardApi.getDashboardStats();
      setStats(response.data);
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err);
      setError(err.response?.data?.message || 'Failed to fetch dashboard statistics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!stats) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="info">No dashboard data available</Alert>
      </Box>
    );
  }

  const statsCards: StatsCard[] = [
    {
      title: 'Total Payments',
      value: stats.totalPayments.toLocaleString(),
      subtitle: `${stats.totalAmount.toLocaleString()} total volume`,
      color: 'primary'
    },
    {
      title: 'Success Rate',
      value: `${stats.successRate.toFixed(1)}%`,
      subtitle: `${stats.pendingPayments} pending payments`,
      color: 'success'
    },
    {
      title: 'Total Refunds',
      value: stats.totalRefunds.toLocaleString(),
      subtitle: `$${stats.refundAmount.toLocaleString()} refunded`,
      color: 'warning'
    },
    {
      title: 'Active Customers',
      value: stats.totalCustomers.toLocaleString(),
      subtitle: 'Registered customers',
      color: 'info'
    },
    {
      title: 'Total Disputes',
      value: stats.totalDisputes.toLocaleString(),
      subtitle: `${stats.pendingDisputes} pending review`,
      color: 'error'
    },
    {
      title: 'Dispute Rate',
      value: `${stats.disputeRate.toFixed(2)}%`,
      subtitle: 'Disputes vs payments ratio',
      color: 'secondary'
    }
  ];

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Dashboard Overview
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Welcome{authState.user?.merchantName ? `, ${authState.user.merchantName}` : ''}. Your business at a glance.
          </Typography>
        </Box>
        
      </Box>

      {/* Statistics Cards */}
      <Box sx={{ mb: 4 }}>
        <StatsCards cards={statsCards} />
      </Box>

      {/* Overview Grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        {/* Payment Activity */}
        <Card sx={{ overflow: 'hidden' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <CreditCard sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6">Recent Payments</Typography>
              <Box sx={{ flex: 1 }} />
            </Box>
            <Typography variant="body2" color="text.secondary">
              Latest payment transactions and their status
            </Typography>
            <Box sx={{ 
              mt: 2, 
              p: 2,
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(25,118,210,0.08)' : 'rgba(25,118,210,0.06)',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider'
            }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip icon={<CheckCircle sx={{ color: 'success.main !important' }} />} label={`${stats.totalPayments} processed`} variant="outlined" color="success" />
                <Chip icon={<Paid sx={{ color: 'primary.main !important' }} />} label={`${stats.totalAmount.toLocaleString()} total volume`} variant="outlined" color="primary" />
                <Chip icon={<HourglassBottom sx={{ color: 'warning.main !important' }} />} label={`${stats.pendingPayments} pending`} variant="outlined" color="warning" />
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">Success rate</Typography>
                <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, stats.successRate))} sx={{ height: 8, borderRadius: 1, mt: 0.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                  <Chip size="small" label={`${stats.successRate.toFixed(1)}%`} color="success" variant="outlined" />
                  <Chip size="small" label={`${stats.pendingPayments} pending`} color="warning" variant="outlined" />
                </Box>
              </Box>
              <Collapse in={expand.payments} timeout="auto" unmountOnExit>
                <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  <Chip size="small" label="Credit Card" />
                  <Chip size="small" label="Bank Transfer" />
                  <Chip size="small" label="Digital Wallet" />
                  <Chip size="small" label="High value alerts" color="error" variant="outlined" />
                </Box>
              </Collapse>
            </Box>
          </CardContent>
        </Card>

        {/* Refund Activity */}
        <Card sx={{ overflow: 'hidden' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <MoneyOff sx={{ mr: 1, color: 'warning.main' }} />
              <Typography variant="h6">Refund Activity</Typography>
            
            </Box>
            <Typography variant="body2" color="text.secondary">
              Refund requests and processing status
            </Typography>
            <Box sx={{ 
              mt: 2, 
              p: 2,
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(245,124,0,0.08)' : 'rgba(245,124,0,0.06)',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider'
            }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip icon={<ReplayCircleFilled sx={{ color: 'warning.main !important' }} />} label={`${stats.totalRefunds} refunds`} variant="outlined" color="warning" />
                <Chip icon={<ReceiptLong sx={{ color: 'primary.main !important' }} />} label={`${stats.refundAmount.toLocaleString()} refunded`} variant="outlined" color="primary" />
                <Chip icon={<HourglassBottom sx={{ color: 'info.main !important' }} />} label={`avg 2-3 business days`} variant="outlined" color="info" />
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">Refund completion</Typography>
                <LinearProgress variant="determinate" value={stats.totalRefunds ? (stats.totalRefunds ? 100 : 0) : 0} sx={{ height: 8, borderRadius: 1, mt: 0.5 }} />
                <Box sx={{ mt: 0.5 }}>
                  <Chip size="small" label={`${stats.totalRefunds} refunds`} variant="outlined" />
                </Box>
              </Box>
              <Collapse in={expand.refunds} timeout="auto" unmountOnExit>
                <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  <Chip size="small" label="Full refunds" />
                  <Chip size="small" label="Partial refunds" />
                  <Chip size="small" label="Gateway issues" color="error" variant="outlined" />
                </Box>
              </Collapse>
            </Box>
          </CardContent>
        </Card>

        {/* Customer Insights */}
        <Card sx={{ overflow: 'hidden' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Group sx={{ mr: 1, color: 'info.main' }} />
              <Typography variant="h6">Customer Insights</Typography>
             
            </Box>
            <Typography variant="body2" color="text.secondary">
              Customer base and engagement metrics
            </Typography>
            <Box sx={{ 
              mt: 2, 
              p: 2,
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(2,136,209,0.08)' : 'rgba(2,136,209,0.06)',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider'
            }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip icon={<GroupAdd sx={{ color: 'success.main !important' }} />} label={`${stats.totalCustomers} active`} variant="outlined" color="success" />
                <Chip icon={<Star sx={{ color: 'secondary.main !important' }} />} label={`High satisfaction`} variant="outlined" color="secondary" />
                <Chip icon={<CheckCircle sx={{ color: 'primary.main !important' }} />} label={`Growing base`} variant="outlined" color="primary" />
              </Box>
              <Collapse in={expand.customers} timeout="auto" unmountOnExit>
                <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1 }}>
                  <Chip size="small" label="New" color="success" variant="outlined" />
                  <Chip size="small" label="Returning" color="primary" variant="outlined" />
                  <Chip size="small" label="VIP" color="secondary" variant="outlined" />
                </Box>
              </Collapse>
            </Box>
          </CardContent>
        </Card>

        {/* Dispute Management */}
        <Card sx={{ overflow: 'hidden' }}>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <AccountBalance sx={{ mr: 1, color: 'error.main' }} />
              <Typography variant="h6">Dispute Management</Typography>
           
            </Box>
            <Typography variant="body2" color="text.secondary">
              Dispute tracking and resolution status
            </Typography>
            <Box sx={{ 
              mt: 2, 
              p: 2,
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(211,47,47,0.1)' : 'rgba(211,47,47,0.06)',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider'
            }}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip icon={<ErrorOutline sx={{ color: 'error.main !important' }} />} label={`${stats.totalDisputes} disputes`} variant="outlined" color="error" />
                <Chip icon={<HourglassBottom sx={{ color: 'warning.main !important' }} />} label={`${stats.pendingDisputes} pending`} variant="outlined" color="warning" />
                <Chip icon={<ReceiptLong sx={{ color: 'secondary.main !important' }} />} label={`${stats.disputeRate.toFixed(2)}% rate`} variant="outlined" color="secondary" />
              </Box>
              <Box sx={{ mt: 2 }}>
                <Typography variant="caption" color="text.secondary">Dispute rate</Typography>
                <LinearProgress variant="determinate" value={Math.max(0, Math.min(100, stats.disputeRate))} sx={{ height: 8, borderRadius: 1, mt: 0.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                  <Chip size="small" label={`${stats.disputeRate.toFixed(2)}%`} color="error" variant="outlined" />
                  <Chip size="small" label={`${stats.pendingDisputes} pending`} color="warning" variant="outlined" />
                </Box>
              </Box>
              <Collapse in={expand.disputes} timeout="auto" unmountOnExit>
                <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                  <Chip size="small" label="Chargebacks" />
                  <Chip size="small" label="Inquiries" />
                  <Chip size="small" label="Won" color="success" variant="outlined" />
                  <Chip size="small" label="Lost" color="error" variant="outlined" />
                </Box>
              </Collapse>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default DashboardPage;