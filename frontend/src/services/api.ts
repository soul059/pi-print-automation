const API_BASE = import.meta.env.VITE_API_URL || '';

function getHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = { 
    'Content-Type': 'application/json',
    // Skip ngrok browser warning page (required for ngrok free tier)
    'ngrok-skip-browser-warning': 'true',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export const api = {
  // Auth - Google
  async googleAuth(credential: string) {
    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ credential }),
    });
    return res.json();
  },

  // Auth - OTP
  async validateEmail(email: string, name: string) {
    const res = await fetch(`${API_BASE}/api/auth/validate-email`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, name }),
    });
    return res.json();
  },

  async verifyOtp(email: string, otp: string, name: string) {
    const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, otp, name }),
    });
    return res.json();
  },

  // Preview
  getPreviewUrl(jobId: string, token: string): string {
    return `${API_BASE}/api/upload/preview/${jobId}?token=${token}`;
  },

  // Upload
  async uploadFile(files: File | File[], config: Record<string, unknown>, token: string) {
    const formData = new FormData();
    const fileArray = Array.isArray(files) ? files : [files];
    for (const file of fileArray) {
      formData.append('files', file);
    }
    formData.append('config', JSON.stringify(config));

    console.log('[API] uploadFile called, files:', fileArray.length);
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
    });
    const data = await res.json();
    console.log('[API] uploadFile response:', data);
    return data;
  },

  // Printer
  async getPrinterStatus() {
    console.log('[API] getPrinterStatus, API_BASE:', API_BASE);
    const res = await fetch(`${API_BASE}/api/printer/status`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  async getPrinters() {
    const res = await fetch(`${API_BASE}/api/printers/list`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  // Pricing config
  async getPricingConfig() {
    const res = await fetch(`${API_BASE}/api/printer/pricing`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  // Supply levels
  async getSupplyLevels(printerName?: string) {
    const query = printerName ? `?printer=${encodeURIComponent(printerName)}` : '';
    const res = await fetch(`${API_BASE}/api/printer/supplies${query}`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  // Leaderboard
  async getLeaderboard() {
    const res = await fetch(`${API_BASE}/api/printer/leaderboard`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  // Payment
  async createPayment(jobId: string, token: string) {
    const res = await fetch(`${API_BASE}/api/payment/create`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ jobId }),
    });
    return res.json();
  },

  async verifyPayment(
    data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
    token: string
  ) {
    const res = await fetch(`${API_BASE}/api/payment/verify`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // Jobs
  async getJob(jobId: string, token: string) {
    console.log('[API] getJob called, jobId:', jobId);
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, {
      headers: getHeaders(token),
    });
    const data = await res.json();
    console.log('[API] getJob response:', data);
    return data;
  },

  async getJobs(token: string) {
    const res = await fetch(`${API_BASE}/api/jobs`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async collectJob(jobId: string, token: string) {
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}/collect`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return res.json();
  },

  async getCollectInfo(jobId: string) {
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}/collect-info`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  // Receipt
  async getReceipt(jobId: string, token: string) {
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}/receipt`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  // User print stats
  async getJobStats(token: string) {
    const res = await fetch(`${API_BASE}/api/jobs/stats`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  // Re-print job
  async reprintJob(jobId: string, options: Record<string, any>, token: string) {
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}/reprint`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(options),
    });
    return res.json();
  },

  // Admin
  async adminLogin(username: string, password: string) {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  },

  async adminGetHealth(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/health`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminGetJobs(token: string, params?: { status?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const res = await fetch(`${API_BASE}/api/admin/jobs?${query}`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminRetryJob(jobId: string, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/jobs/${jobId}/retry`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminCancelJob(jobId: string, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminRefundJob(jobId: string, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/jobs/${jobId}/refund`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminBulkRefund(jobIds: string[], token: string) {
    const res = await fetch(`${API_BASE}/api/admin/jobs/bulk-refund`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ jobIds }),
    });
    return res.json();
  },

  async adminDirectPrint(file: File, options: { paperSize?: string; copies?: number; duplex?: boolean; color?: string; printerName?: string }, token: string) {
    const formData = new FormData();
    formData.append('file', file);
    if (options.paperSize) formData.append('paperSize', options.paperSize);
    if (options.copies) formData.append('copies', String(options.copies));
    if (options.duplex !== undefined) formData.append('duplex', String(options.duplex));
    if (options.color) formData.append('color', options.color);
    if (options.printerName) formData.append('printerName', options.printerName);
    const res = await fetch(`${API_BASE}/api/admin/print`, {
      method: 'POST',
      headers: { 
        Authorization: `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true',
      },
      body: formData,
    });
    return res.json();
  },

  async adminGetAnalytics(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/analytics`, {
      headers: getHeaders(token),
    });
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  },

  async adminGetPolicies(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/policies`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminCreatePolicy(data: Record<string, unknown>, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/policies`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async adminUpdatePolicy(id: number, data: Record<string, unknown>, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/policies/${id}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async adminDeletePolicy(id: number, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/policies/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return res.json();
  },

  // Announcements (public)
  async getActiveAnnouncement() {
    const res = await fetch(`${API_BASE}/api/announcements`, {
      headers: getHeaders(),
    });
    return res.json();
  },

  // Announcements (admin)
  async adminGetAnnouncements(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/announcements`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminCreateAnnouncement(message: string, type: string, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/announcements`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ message, type }),
    });
    return res.json();
  },

  async adminUpdateAnnouncement(id: number, data: { message?: string; type?: string; active?: boolean }, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/announcements/${id}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async adminDeleteAnnouncement(id: number, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/announcements/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return res.json();
  },

  // Wallet
  async getWallet(token: string) {
    console.log('[API] getWallet called, API_BASE:', API_BASE);
    const res = await fetch(`${API_BASE}/api/wallet`, {
      headers: getHeaders(token),
    });
    console.log('[API] getWallet response status:', res.status);
    const data = await res.json();
    console.log('[API] getWallet data:', data);
    return data;
  },

  async walletTopup(amount: number, token: string) {
    const res = await fetch(`${API_BASE}/api/wallet/topup`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ amount }),
    });
    return res.json();
  },

  async walletTopupVerify(
    data: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string },
    token: string
  ) {
    const res = await fetch(`${API_BASE}/api/wallet/topup/verify`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(data),
    });
    return res.json();
  },

  async payWithWallet(jobId: string, token: string) {
    const res = await fetch(`${API_BASE}/api/payment/wallet`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ jobId }),
    });
    return res.json();
  },

  // Print Limits
  async getUserLimit(token: string) {
    const res = await fetch(`${API_BASE}/api/user/limit`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async getNotificationPrefs(token: string) {
    const res = await fetch(`${API_BASE}/api/user/notifications`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async updateNotificationPrefs(prefs: { emailOnCompleted: boolean; emailOnFailed: boolean }, token: string) {
    const res = await fetch(`${API_BASE}/api/user/notifications`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(prefs),
    });
    return res.json();
  },

  async adminGetDailyLimit(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/settings/daily-limit`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminSetDailyLimit(limit: number, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/settings/daily-limit`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({ limit }),
    });
    return res.json();
  },

  async adminGetOperatingHours(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/settings/operating-hours`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminSetOperatingHours(config: { enabled: boolean; startHour: number; endHour: number; days: number[] }, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/settings/operating-hours`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(config),
    });
    return res.json();
  },

  async adminGrantExemption(email: string, extraPages: number, reason: string, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/exemptions`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ email, extraPages, reason }),
    });
    return res.json();
  },

  async adminGetExemptions(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/exemptions`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminRevokeExemption(id: number, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/exemptions/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return res.json();
  },

  // CSV Export
  async downloadCSV(url: string, token: string, filename: string) {
    const res = await fetch(`${API_BASE}${url}`, {
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
    const res = await fetch(`${API_BASE}/api/admin/maintenance?limit=${limit}&offset=${offset}`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminAddMaintenanceEntry(entry: { printerName?: string; eventType: string; description: string }, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/maintenance`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify(entry),
    });
    return res.json();
  },

  async adminDeleteMaintenanceEntry(id: number, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/maintenance/${id}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return res.json();
  },

  // Telegram
  async adminGetTelegramStatus(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/telegram/status`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminTestTelegram(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/telegram/test`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return res.json();
  },

  // Queue Control (admin)
  async adminGetQueueStatus(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/queue/status`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminPauseQueue(reason: string, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/queue/pause`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ reason }),
    });
    return res.json();
  },

  async adminResumeQueue(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/queue/resume`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminForceResumeQueue(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/queue/force-resume`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminAcknowledgePaper(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/queue/acknowledge-paper`, {
      method: 'POST',
      headers: getHeaders(token),
    });
    return res.json();
  },

  // ============ PEON API ============

  async peonLogin(username: string, password: string) {
    const res = await fetch(`${API_BASE}/api/peon/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, password }),
    });
    return res.json();
  },

  async peonGetStatus(token: string) {
    const res = await fetch(`${API_BASE}/api/peon/status`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async peonAddPaper(printerName: string, count: number, token: string) {
    const res = await fetch(`${API_BASE}/api/peon/paper/add`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ printerName, count }),
    });
    return res.json();
  },

  async peonGetActivity(token: string, limit?: number) {
    const url = limit 
      ? `${API_BASE}/api/peon/activity?limit=${limit}`
      : `${API_BASE}/api/peon/activity`;
    const res = await fetch(url, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async peonGetMe(token: string) {
    const res = await fetch(`${API_BASE}/api/peon/me`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  // Admin - Peon Management
  async adminGetPeons(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/peons`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminCreatePeon(username: string, password: string, displayName: string, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/peons`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ username, password, displayName }),
    });
    return res.json();
  },

  async adminUpdatePeon(peonId: number, updates: { displayName?: string; password?: string; active?: boolean }, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/peons/${peonId}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify(updates),
    });
    return res.json();
  },

  async adminDeletePeon(peonId: number, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/peons/${peonId}`, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    return res.json();
  },

  // Admin - Paper Tracking
  async adminGetPaperStatus(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/paper/status`, {
      headers: getHeaders(token),
    });
    return res.json();
  },

  async adminAddPaper(printerName: string, count: number, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/paper/add`, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({ printerName, count }),
    });
    return res.json();
  },

  async adminSetPaperThreshold(printerName: string, threshold: number, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/paper/threshold/${encodeURIComponent(printerName)}`, {
      method: 'PUT',
      headers: getHeaders(token),
      body: JSON.stringify({ threshold }),
    });
    return res.json();
  },

  async adminGetPaperHistory(token: string, printerName?: string, limit?: number) {
    const params = new URLSearchParams();
    if (printerName) params.set('printer', printerName);
    if (limit) params.set('limit', limit.toString());
    const url = `${API_BASE}/api/admin/paper/history${params.toString() ? '?' + params.toString() : ''}`;
    const res = await fetch(url, {
      headers: getHeaders(token),
    });
    return res.json();
  },
};
