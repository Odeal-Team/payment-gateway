import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Paper,
  Button,
  Chip,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Add,
  Edit,
  ArrowUpward,
  ArrowDownward,
  AccessTime
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import dashboardAPI from '../services/dashboardApi';
import {
  DisputeStats,
  DisputeListItem,
  DisputeStatus,
  DisputeReason,
  PaginationInfo
} from '../types/dashboard';

interface DisputesPageProps {
  // No props needed, merchant ID will be fetched from localStorage
}

const DisputesPage: React.FC<DisputesPageProps> = () => {
  const navigate = useNavigate();
  const { state: authState } = useAuth();
  
  // States
  const [stats, setStats] = useState<DisputeStats | null>(null);
  const [disputes, setDisputes] = useState<DisputeListItem[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 0,
    totalPages: 0,
    totalCount: 0,
    pageSize: 10,
    hasNext: false,
    hasPrev: false
  });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data
  const loadStats = async () => {
    try {
      setStatsLoading(true);
      const merchantId = authState.user?.merchantId || 'MERCH001';
      console.log('📊 Loading dispute stats for merchant:', merchantId);
      const statsData = await dashboardAPI.getDisputeStats(merchantId);
      console.log('✅ Stats loaded successfully:', statsData);
      setStats(statsData);
      // Clear any previous errors when stats load successfully
      if (error && error.includes('İstatistikler')) {
        setError(null);
      }
    } catch (err: any) {
      console.error('❌ Error loading dispute stats:', err);
      console.error('❌ Error details:', {
        message: err.message,
        status: err.response?.status,
        data: err.response?.data
      });
      // Stats loading hatası için error gösterme, sadece console'da log'la
      // setError(`İstatistikler yüklenemedi: ${err.message}`);
    } finally {
      setStatsLoading(false);
    }
  };

  const loadDisputes = async (page = 0) => {
    try {
      setLoading(true);
      const merchantId = authState.user?.merchantId || 'MERCH001';
      console.log('🔄 Loading disputes for page:', page, 'merchant:', merchantId);
      
      const { disputes: disputeData, pagination: paginationData } = await dashboardAPI.getDisputes(
        merchantId,
        page,
        pagination.pageSize
      );
      
      console.log('📊 Disputes API response:', { disputeData, paginationData });
      console.log('📋 Disputes count:', disputeData.length);
      
      setDisputes(disputeData);
      setPagination(paginationData);
      
      console.log('✅ Disputes loaded successfully');
    } catch (err) {
      console.error('❌ Error loading disputes:', err);
      setError('Disputelar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Effects
  useEffect(() => {
    if (authState.user?.merchantId) {
      loadStats();
      loadDisputes();
    }
  }, [authState.user?.merchantId]); // merchantId değiştiğinde yeniden yükle

  // Debug: disputes state'ini log'la
  useEffect(() => {
    console.log('🔍 Disputes state changed:', disputes);
    console.log('🔍 Disputes length:', disputes.length);
    console.log('🔍 Disputes data:', disputes);
  }, [disputes]);

  // Handlers
  const handlePageChange = (event: unknown, newPage: number) => {
    loadDisputes(newPage);
  };

  const handleRefresh = () => {
    loadStats();
    loadDisputes();
  };

  const handleDisputeDetail = (disputeId: string) => {
    navigate(`/dashboard/disputes/${disputeId}`);
  };

  // Helper functions
  const parseBackendDate = (dateData: any): Date => {
    try {
      // İlk önce string formatını kontrol et (Jackson ISO format)
      if (typeof dateData === 'string') {
        const parsedDate = new Date(dateData);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
      
      // Null veya undefined kontrolü
      if (!dateData) {
        console.warn('Boş tarih verisi:', dateData);
        return new Date();
      }
      
      // Array formatını kontrol et (Java LocalDateTime serializasyonu)
      if (Array.isArray(dateData) && dateData.length >= 3) {
        const [year, month, day, hour = 0, minute = 0, second = 0, nano = 0] = dateData;
        
        // Tarih bileşenlerinin geçerliliğini kontrol et
        if (typeof year === 'number' && typeof month === 'number' && typeof day === 'number') {
          // JavaScript Date constructor month 0-based (January = 0)
          const date = new Date(year, month - 1, day, hour || 0, minute || 0, second || 0, Math.floor((nano || 0) / 1000000));
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
    } catch (error) {
      console.error('Tarih parse hatası:', dateData, error);
    }
    
    // Son çare: geçerli tarih
    console.warn('Geçersiz tarih verisi, şu anki tarihi kullanıyor:', dateData);
    return new Date();
  };

  const getStatusColor = (status: DisputeStatus): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
    switch (status) {
      case DisputeStatus.WON:
        return 'success';
      case DisputeStatus.LOST:
        return 'error';
      case DisputeStatus.UNDER_REVIEW:
        return 'warning';
      case DisputeStatus.EVIDENCE_REQUIRED:
        return 'info';
      case DisputeStatus.OPENED:
        return 'primary';
      case DisputeStatus.RESOLVED:
        return 'success';
      case DisputeStatus.CLOSED:
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getStatusText = (status: DisputeStatus): string => {
    switch (status) {
      case DisputeStatus.OPENED:
        return 'Açıldı';
      case DisputeStatus.UNDER_REVIEW:
        return 'İnceleme Altında';
      case DisputeStatus.EVIDENCE_REQUIRED:
        return 'Kanıt Gerekli';
      case DisputeStatus.RESOLVED:
        return 'Çözüldü';
      case DisputeStatus.CLOSED:
        return 'Kapatıldı';
      case DisputeStatus.WON:
        return 'Kazanıldı';
      case DisputeStatus.LOST:
        return 'Kaybedildi';
      default:
        return status;
    }
  };

  const getReasonText = (reason: DisputeReason): string => {
    switch (reason) {
      case DisputeReason.FRAUD:
        return 'Dolandırıcılık';
      case DisputeReason.DUPLICATE:
        return 'Duplike İşlem';
      case DisputeReason.PRODUCT_NOT_RECEIVED:
        return 'Ürün Teslim Alınmadı';
      case DisputeReason.PRODUCT_NOT_AS_DESCRIBED:
        return 'Ürün Açıklaması Uygun Değil';
      case DisputeReason.CREDIT_NOT_PROCESSED:
        return 'Kredi İşlenmedi';
      case DisputeReason.GENERAL:
        return 'Genel';
      case DisputeReason.OTHER:
        return 'Diğer';
      default:
        return reason;
    }
  };

  if (loading && !disputes.length) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box p={3}>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" fontWeight="bold">
          Dispute Yönetimi
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Add />}
          onClick={handleRefresh}
          disabled={loading}
        >
          Yenile
        </Button>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      {statsLoading ? (
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, 
          gap: 3, 
          mb: 4 
        }}>
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="h6" color="text.secondary">
                      Yükleniyor...
                    </Typography>
                    <CircularProgress size={24} />
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      ) : stats ? (
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, 
          gap: 3, 
          mb: 4 
        }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" color="text.secondary">
                    Toplam Dispute
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {stats.totalDisputes}
                  </Typography>
                </Box>
                <Add color="warning" fontSize="large" />
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" color="text.secondary">
                    Bekleyen Cevaplar
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="warning.main">
                    {stats.pendingResponses}
                  </Typography>
                </Box>
                <AccessTime color="warning" fontSize="large" />
              </Box>
              {stats.urgentDisputes > 0 && (
                <Chip
                  size="small"
                  color="error"
                  label={`${stats.urgentDisputes} acil`}
                  sx={{ mt: 1 }}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" color="text.secondary">
                    Kazanma Oranı
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    %{stats.winRate?.toFixed(1) || '0.0'}
                  </Typography>
                </Box>
                <ArrowUpward color="success" fontSize="large" />
              </Box>
              <Typography variant="body2" color="text.secondary" mt={1}>
                Kazanılan: {stats.wonDisputes}, Kaybedilen: {stats.lostDisputes}
              </Typography>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" color="text.secondary">
                    Toplam Tutar
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    ₺{stats.totalDisputeAmount?.toLocaleString() || '0'}
                  </Typography>
                </Box>
                <ArrowDownward color="error" fontSize="large" />
              </Box>
            </CardContent>
          </Card>
        </Box>
      ) : (
        // Fallback stats when API fails
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, 
          gap: 3, 
          mb: 4 
        }}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" color="text.secondary">
                    Toplam Dispute
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {disputes.length}
                  </Typography>
                </Box>
                <Add color="warning" fontSize="large" />
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" color="text.secondary">
                    Aktif Disputes
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="info.main">
                    {disputes.filter(d => d.status === 'UNDER_REVIEW' || d.status === 'OPENED').length}
                  </Typography>
                </Box>
                <AccessTime color="info" fontSize="large" />
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" color="text.secondary">
                    Toplam Tutar
                  </Typography>
                  <Typography variant="h4" fontWeight="bold">
                    {disputes.reduce((sum, d) => sum + (d.amount || 0), 0).toLocaleString()}
                  </Typography>
                </Box>
                <ArrowDownward color="error" fontSize="large" />
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="h6" color="text.secondary">
                    Durum
                  </Typography>
                  <Typography variant="h4" fontWeight="bold" color="success.main">
                    Aktif
                  </Typography>
                </Box>
                <ArrowUpward color="success" fontSize="large" />
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Disputes Table */}
      <Paper>
        {/* Debug Info */}
        <Box sx={{ p: 2, bgcolor: 'background.default', borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary">
            Debug: Merchant: {authState.user?.merchantId} | Disputes count: {disputes.length} | Loading: {loading.toString()} | Error: {error || 'none'}
          </Typography>
        </Box>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Dispute ID</TableCell>
                <TableCell>Payment ID</TableCell>
                <TableCell>Customer ID</TableCell>
                <TableCell>Tutar</TableCell>
                <TableCell>Durum</TableCell>
                <TableCell>Sebep</TableCell>
                <TableCell>Tarih</TableCell>
                <TableCell>İşlemler</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {disputes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center">
                    <Typography variant="body2" color="text.secondary" py={4}>
                      Henüz dispute bulunamadı.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                disputes.map((dispute) => (
                  <TableRow key={dispute.disputeId}>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {dispute.disputeId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {dispute.paymentId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontFamily="monospace">
                        {dispute.customerId}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {dispute.currency} {dispute.amount.toLocaleString()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={getStatusColor(dispute.status)}
                        label={getStatusText(dispute.status)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {getReasonText(dispute.reason)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {(() => {
                          try {
                            if (!dispute.disputeDate) {
                              return 'Tarih belirtilmemiş';
                            }
                            const parsedDate = parseBackendDate(dispute.disputeDate);
                            return format(parsedDate, 'dd.MM.yyyy HH:mm');
                          } catch (error) {
                            console.error('Tarih formatında hata:', dispute.disputeDate, error);
                            return 'Geçersiz tarih';
                          }
                        })()}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Tooltip title="Detayları Görüntüle">
                        <IconButton 
                          size="small"
                          onClick={() => handleDisputeDetail(dispute.disputeId)}
                        >
                          <Edit />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <TablePagination
          component="div"
          count={pagination.totalCount}
          page={pagination.page}
          onPageChange={handlePageChange}
          rowsPerPage={pagination.pageSize}
          rowsPerPageOptions={[5, 10, 25, 50]}
          labelRowsPerPage="Sayfa başına satır:"
          labelDisplayedRows={({ from, to, count }) =>
            `${from}-${to} / ${count !== -1 ? count : `${to}'den fazla`}`
          }
        />
      </Paper>
    </Box>
  );
};

export default DisputesPage;