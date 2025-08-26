import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Chip,
  IconButton,
  Pagination,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  Visibility,
  Receipt,
  Info,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { RefundListItem, RefundStatus } from '../../types/dashboard';
import StatusChip from '../common/StatusChip';

interface RefundsTableProps {
  refunds: RefundListItem[];
  loading: boolean;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onViewRefund: (refund: RefundListItem) => void;
}

const RefundsTable: React.FC<RefundsTableProps> = ({
  refunds,
  loading,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onViewRefund,
}) => {
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
  };

  const formatAmount = (amount: number, currency: string) => {
    // TRY için ₺ sembolü kullan
    if (currency === 'TRY') {
      return `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    
    // Diğer para birimleri için standart format
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  };

  const getStatusColor = (status: RefundStatus) => {
    switch (status) {
      case RefundStatus.COMPLETED:
        return 'success';
      case RefundStatus.PENDING:
      case RefundStatus.PROCESSING:
        return 'warning';
      case RefundStatus.FAILED:
        return 'error';
      case RefundStatus.CANCELLED:
        return 'default';
      default:
        return 'default';
    }
  };

  const getReasonLabel = (reason: string) => {
    return reason.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  if (loading && refunds.length === 0) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (refunds.length === 0) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Receipt sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No refunds found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No refunds match your current search criteria.
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        {/* Table Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Refunds ({totalCount})
          </Typography>
          {loading && <CircularProgress size={20} />}
        </Box>

        {/* Table */}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Refund ID</TableCell>
                <TableCell>Payment ID</TableCell>
                <TableCell>Customer</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Reason</TableCell>
                <TableCell>Refund Date</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {refunds.map((refund) => (
                <TableRow 
                key={refund.id} 
                hover 
                onClick={() => onViewRefund(refund)}
                sx={{ 
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: 'action.hover'
                  }
                }}
              >
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                      {refund.refundId}
                    </Typography>
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                      {refund.paymentId}
                    </Typography>
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2">
                      {refund.customerId}
                    </Typography>
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatAmount(refund.amount, refund.currency)}
                    </Typography>
                  </TableCell>
                  
                  <TableCell>
                    <StatusChip status={refund.status} size="small" />
                  </TableCell>
                  
                  <TableCell>
                    <Chip
                      label={getReasonLabel(refund.reason)}
                      size="small"
                      variant="outlined"
                      color="default"
                    />
                  </TableCell>
                  
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(refund.refundDate)}
                    </Typography>
                  </TableCell>
                  
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <Tooltip title="View Details">
                        <IconButton
                          size="small"
                          onClick={() => onViewRefund(refund)}
                        >
                          <Visibility fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      
                      {refund.description && (
                        <Tooltip title={refund.description}>
                          <IconButton size="small">
                            <Info fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        {totalPages > 1 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
            <Pagination
              count={totalPages}
              page={currentPage}
              onChange={(event, page) => onPageChange(page)}
              color="primary"
              size="large"
              showFirstButton
              showLastButton
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default RefundsTable;