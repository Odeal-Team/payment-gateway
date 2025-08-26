import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Container,
  Avatar,
  Link,
} from '@mui/material';
import { LockOutlined } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { state, login, clearError } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (state.isAuthenticated) {
      navigate('/dashboard');
    }
  }, [state.isAuthenticated, navigate]);

  // Clear error when component mounts or inputs change
  useEffect(() => {
    if (state.error) {
      clearError();
    }
  }, [email, password, clearError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      return;
    }

    const success = await login({ email, password });
    if (success) {
      navigate('/dashboard');
    }
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: 400,
          }}
        >
          {/* Logo/Icon */}
          <Avatar sx={{ m: 1, bgcolor: 'primary.main', width: 56, height: 56 }}>
            <LockOutlined />
          </Avatar>

          {/* Title */}
          <Typography component="h1" variant="h4" sx={{ mb: 1, fontWeight: 600 }}>
            Payment Gateway
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
            Sign in to your merchant dashboard
          </Typography>

          {/* Test Account Information */}
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 2, 
              mb: 3, 
              bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.50', 
              border: '1px solid', 
              borderColor: (theme) => theme.palette.mode === 'dark' ? 'grey.700' : 'grey.300' 
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Test Accounts:
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Test Merchant:</strong><br />
              Email: merchant@test.com<br />
              Password: password
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <strong>Demo Store:</strong><br />
              Email: demo@store.com<br />
              Password: demo123
            </Typography>
            <Typography variant="body2">
              <strong>Sample Shop:</strong><br />
              Email: contact@sample.com<br />
              Password: sample456
            </Typography>
          </Paper>

          {/* Error Alert */}
          {state.error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {state.error}
            </Alert>
          )}

          {/* Login Form */}
          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={state.loading}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={state.loading}
            />
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2, py: 1.5 }}
              disabled={state.loading || !email || !password}
            >
              {state.loading ? (
                <>
                  <CircularProgress size={20} sx={{ mr: 1 }} />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </Button>

            

            {/* Footer Links */}
            <Box sx={{ mt: 3, textAlign: 'center' }}>
              <Link href="#" variant="body2" color="text.secondary">
                Forgot password?
              </Link>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Need help? Contact support
              </Typography>
            </Box>
          </Box>
        </Paper>

        {/* Footer */}
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">
            © 2025 Payment Gateway. All rights reserved.
          </Typography>
        </Box>
      </Box>
    </Container>
  );
};

export default LoginPage;