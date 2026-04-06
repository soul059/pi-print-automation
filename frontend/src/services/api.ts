const API_BASE = import.meta.env.VITE_API_URL || '';

// Custom error class for API errors
export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: string,
    public isNetworkError: boolean = false,
    public isServerError: boolean = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// User-friendly error messages
const ERROR_MESSAGES: Record<string, string> = {
  'Failed to fetch': 'Cannot connect to server. Please check your internet connection.',
  'NetworkError': 'Network error. Please check your connection and try again.',
  'TypeError': 'Connection failed. The server may be offline.',
  'AbortError': 'Request timed out. Please try again.',
  'daily_limit_exceeded': 'You have reached your daily print limit.',
  'not_authorized': 'Please log in to continue.',
  'invalid_token': 'Your session has expired. Please log in again.',
  'file_too_large': 'File is too large. Maximum size is 50MB.',
  'invalid_file_type': 'Invalid file type. Please upload PDF files only.',
  'printer_offline': 'Printer is currently offline. Please try again later.',
};

function getErrorMessage(error: any, defaultMsg: string = 'Something went wrong'): string {
  if (error instanceof ApiError) return error.message;
  
  const errorStr = String(error?.message || error);
  for (const [key, msg] of Object.entries(ERROR_MESSAGES)) {
    if (errorStr.includes(key)) return msg;
  }
  return defaultMsg;
}

function getHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = { 
    'Content-Type': 'application/json',
    // Skip ngrok browser warning page (required for ngrok free tier)
    'ngrok-skip-browser-warning': 'true',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Wrapper for fetch with timeout and better error handling
async function safeFetch(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new ApiError('Request timed out. Please try again.', undefined, 'TIMEOUT', true);
    }
    
    // Network errors (server offline, no internet, etc.)
    throw new ApiError(
      getErrorMessage(error, 'Cannot connect to server'),
      undefined,
      'NETWORK_ERROR',
      true
    );
  }
}

// Parse JSON response with error handling
async function parseResponse<T = any>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorData: any = {};
    try {
      errorData = await response.json();
    } catch {
      // Response is not JSON
    }

    const message = errorData.error || errorData.message || `Server error (${response.status})`;
    throw new ApiError(
      ERROR_MESSAGES[message] || message,
      response.status,
      errorData.code,
      false,
      response.status >= 500
    );
  }

  try {
    return await response.json();
  } catch {
    throw new ApiError('Invalid response from server', response.status, 'PARSE_ERROR');
  }
}

export const api = {
  // Auth - Google
  async googleAuth(credential: string) {
    const res = await safeFetch(`${API_BASE}/api/auth/google`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ credential }),
    });
    return parseResponse(res);
  },

  // Auth - OTP
  async validateEmail(email: string, name: string) {
    const res = await safeFetch(`${API_BASE}/api/auth/validate-email`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, name }),
    });
    return parseResponse(res);
  },

  async verifyOtp(email: string, otp: string, name: string) {
    const res = await safeFetch(`${API_BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, otp, name }),
    });
    return parseResponse(res);
  },

  // Preview
  getPreviewUrl(jobId: string, token: string): string {
    return `${API_BASE}/api/upload/preview/${jobId}?token=${token}`;
  },

  // Upload (longer timeout for file uploads)
  async uploadFile(files: File | File[], config: Record<string, unknown>, token: string) {
    const formData = new FormData();
    const fileArray = Array.isArray(files) ? files : [files];
    for (const file of fileArray) {
      formData.append('files', file);
    }
    formData.append('config', JSON.stringify(config));

    const res = await safeFetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
    }, 60000); // 60s timeout for uploads
    const data = await parseResponse(res);
    return data;
  },

  // Printer
  async getPrinterStatus() {
    const res = await safeFetch(`${API_BASE}/api/printer/status`, {
      headers: getHeaders(),
    });
    return parseResponse(res);
  },

  async getPrinters() {
    const res = await safeFetch(`${API_BASE}/api/printers/list`, {
      headers: getHeaders(),
    });
    return parseResponse(res);
  },

  // Pricing config
  async getPricingConfig() {
    const res = await safeFetch(`${API_BASE}/api/printer/pricing`, {
      headers: getHeaders(),
    });
    return parseResponse(res);
  },

  // Supply levels
  async getSupplyLevels(printerName?: string) {
    const query = printerName ? `?printer=${encodeURIComponent(printerName)}` : '';
    const res = await safeFetch(`${API_BASE}/api/printer/supplies${query}`, {
      headers: getHeaders(),
    });
    return parseResponse(res);
  },

  // Leaderboard
  async getLeaderboard() {
    const res = await safeFetch(`${API_BASE}/api/printer/leaderboard`, {
      headers: getHeaders(),
    });
    return parseResponse(res);
  },

  // Payment
  async createPayment(jobId: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/payment/create`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ jobId }),
    });
    return parseResponse(res);
  },

  async verifyPayment(
    data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
    token: string
  ) {
    const res = await safeFetch(`${API_BASE}/api/payment/verify`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },

  // Jobs
  async getJob(jobId: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/jobs/${jobId}`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async getJobs(token: string) {
    const res = await safeFetch(`${API_BASE}/api/jobs`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async collectJob(jobId: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/jobs/${jobId}/collect`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async getCollectInfo(jobId: string) {
    const res = await safeFetch(`${API_BASE}/api/jobs/${jobId}/collect-info`, {
      headers: getHeaders(),
    });
    return parseResponse(res);
  },

  // Receipt
  async getReceipt(jobId: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/jobs/${jobId}/receipt`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // User print stats
  async getJobStats(token: string) {
    const res = await safeFetch(`${API_BASE}/api/jobs/stats`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // Re-print job
  async reprintJob(jobId: string, options: Record<string, any>, token: string) {
    const res = await safeFetch(`${API_BASE}/api/jobs/${jobId}/reprint`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(options),
    });
    return parseResponse(res);
  },

  // Admin
  async adminLogin(username: string, password: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, password }),
    });
    return parseResponse(res);
  },

  async adminGetHealth(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/health`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminGetJobs(token: string, params?: { status?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const res = await safeFetch(`${API_BASE}/api/admin/jobs?${query}`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminRetryJob(jobId: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/jobs/${jobId}/retry`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminCancelJob(jobId: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminRefundJob(jobId: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/jobs/${jobId}/refund`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminBulkRefund(jobIds: string[], token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/jobs/bulk-refund`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ jobIds }),
    });
    return parseResponse(res);
  },

  async adminDirectPrint(file: File, options: { paperSize?: string; copies?: number; duplex?: boolean; color?: string; printerName?: string }, token: string) {
    const formData = new FormData();
    formData.append('file', file);
    if (options.paperSize) formData.append('paperSize', options.paperSize);
    if (options.copies) formData.append('copies', String(options.copies));
    if (options.duplex !== undefined) formData.append('duplex', String(options.duplex));
    if (options.color) formData.append('color', options.color);
    if (options.printerName) formData.append('printerName', options.printerName);
    const res = await safeFetch(`${API_BASE}/api/admin/print`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
    }, 60000);
    return parseResponse(res);
  },

  async adminGetAnalytics(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/analytics`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminGetPolicies(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/policies`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminCreatePolicy(data: Record<string, unknown>, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/policies`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },

  async adminUpdatePolicy(id: number, data: Record<string, unknown>, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/policies/${id}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },

  async adminDeletePolicy(id: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/policies/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // Announcements (public)
  async getActiveAnnouncement() {
    const res = await safeFetch(`${API_BASE}/api/announcements`, {
      headers: getHeaders(),
    });
    return parseResponse(res);
  },

  // Announcements (admin)
  async adminGetAnnouncements(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/announcements`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminCreateAnnouncement(message: string, type: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/announcements`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ message, type }),
    });
    return parseResponse(res);
  },

  async adminUpdateAnnouncement(id: number, data: { message?: string; type?: string; active?: boolean }, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/announcements/${id}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },

  async adminDeleteAnnouncement(id: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/announcements/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // Wallet
  async getWallet(token: string) {
    const res = await safeFetch(`${API_BASE}/api/wallet`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async walletTopup(amount: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/wallet/topup`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ amount }),
    });
    return parseResponse(res);
  },

  async walletTopupVerify(
    data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
    token: string
  ) {
    const res = await safeFetch(`${API_BASE}/api/wallet/topup/verify`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return parseResponse(res);
  },

  async payWithWallet(jobId: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/payment/wallet`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ jobId }),
    });
    return parseResponse(res);
  },

  // Print Limits
  async getUserLimit(token: string) {
    const res = await safeFetch(`${API_BASE}/api/user/limit`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async getNotificationPrefs(token: string) {
    const res = await safeFetch(`${API_BASE}/api/user/notifications`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async updateNotificationPrefs(prefs: { emailOnCompleted: boolean; emailOnFailed: boolean }, token: string) {
    const res = await safeFetch(`${API_BASE}/api/user/notifications`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(prefs),
    });
    return parseResponse(res);
  },

  async adminGetDailyLimit(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/settings/daily-limit`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminSetDailyLimit(limit: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/settings/daily-limit`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({ limit }),
    });
    return parseResponse(res);
  },

  async adminGetOperatingHours(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/settings/operating-hours`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminSetOperatingHours(config: { enabled: boolean; startHour: number; endHour: number; days: number[] }, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/settings/operating-hours`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(config),
    });
    return parseResponse(res);
  },

  async adminGrantExemption(email: string, extraPages: number, reason: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/exemptions`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ email, extraPages, reason }),
    });
    return parseResponse(res);
  },

  async adminGetExemptions(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/exemptions`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminRevokeExemption(id: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/exemptions/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // CSV Export
  async downloadCSV(url: string, token: string, filename: string) {
    const res = await safeFetch(`${API_BASE}${url}`, {
      headers: getHeaders(token),
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },

  // Maintenance Log
  async adminGetMaintenanceLog(token: string, limit = 50, offset = 0) {
    const res = await safeFetch(`${API_BASE}/api/admin/maintenance?limit=${limit}&offset=${offset}`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminAddMaintenanceEntry(entry: { printerName?: string; eventType: string; description: string }, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/maintenance`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(entry),
    });
    return parseResponse(res);
  },

  async adminDeleteMaintenanceEntry(id: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/maintenance/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // Telegram
  async adminGetTelegramStatus(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/telegram/status`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminTestTelegram(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/telegram/test`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // Queue Control (admin)
  async adminGetQueueStatus(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/queue/status`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminPauseQueue(reason: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/queue/pause`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ reason }),
    });
    return parseResponse(res);
  },

  async adminResumeQueue(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/queue/resume`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminForceResumeQueue(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/queue/force-resume`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminAcknowledgePaper(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/queue/acknowledge-paper`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // ============ PEON API ============

  async peonLogin(username: string, password: string) {
    const res = await safeFetch(`${API_BASE}/api/peon/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, password }),
    });
    return parseResponse(res);
  },

  async peonGetStatus(token: string) {
    const res = await safeFetch(`${API_BASE}/api/peon/status`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async peonAddPaper(printerName: string, count: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/peon/paper/add`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ printerName, count }),
    });
    return parseResponse(res);
  },

  async peonGetActivity(token: string, limit?: number) {
    const url = limit 
      ? `${API_BASE}/api/peon/activity?limit=${limit}`
      : `${API_BASE}/api/peon/activity`;
    const res = await safeFetch(url, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async peonGetMe(token: string) {
    const res = await safeFetch(`${API_BASE}/api/peon/me`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // Admin - Peon Management
  async adminGetPeons(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/peons`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminCreatePeon(username: string, password: string, displayName: string, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/peons`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ username, password, displayName }),
    });
    return parseResponse(res);
  },

  async adminUpdatePeon(peonId: number, updates: { displayName?: string; password?: string; active?: boolean }, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/peons/${peonId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(updates),
    });
    return parseResponse(res);
  },

  async adminDeletePeon(peonId: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/peons/${peonId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  // Admin - Paper Tracking
  async adminGetPaperStatus(token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/paper/status`, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },

  async adminAddPaper(printerName: string, count: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/paper/add`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ printerName, count }),
    });
    return parseResponse(res);
  },

  async adminSetPaperThreshold(printerName: string, threshold: number, token: string) {
    const res = await safeFetch(`${API_BASE}/api/admin/paper/threshold/${encodeURIComponent(printerName)}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({ threshold }),
    });
    return parseResponse(res);
  },

  async adminGetPaperHistory(token: string, printerName?: string, limit?: number) {
    const params = new URLSearchParams();
    if (printerName) params.set('printer', printerName);
    if (limit) params.set('limit', limit.toString());
    const url = `${API_BASE}/api/admin/paper/history${params.toString() ? '?' + params.toString() : ''}`;
    const res = await safeFetch(url, {
      headers: getHeaders(token),
    });
    return parseResponse(res);
  },
};
