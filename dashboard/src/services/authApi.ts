import axios from 'axios';
import { LoginRequest, LoginResponse } from '../types/auth';

const API_BASE_URL = 'http://localhost:8080';

const authApiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const authAPI = {
  // Backend authentication endpoint
  login: async (credentials: LoginRequest): Promise<LoginResponse> => {
    try {
      // Real backend authentication endpoint
      const response = await authApiClient.post('/v1/auth/login', credentials);
      return response.data;
      
    } catch (error: any) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    }
  },

};