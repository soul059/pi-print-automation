const API_BASE = import.meta.env.VITE_API_URL || '';

function getHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
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

    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    return res.json();
  },

  // Printer
  async getPrinterStatus() {
    const res = await fetch(`${API_BASE}/api/printer/status`);
    return res.json();
  },

  async getPrinters() {
    const res = await fetch(`${API_BASE}/api/printers/list`);
    return res.json();
  },

  // Pricing config
  async getPricingConfig() {
    const res = await fetch(`${API_BASE}/api/printer/pricing`);
    return res.json();
  },

  // Supply levels
  async getSupplyLevels(printerName?: string) {
    const query = printerName ? `?printer=${encodeURIComponent(printerName)}` : '';
    const res = await fetch(`${API_BASE}/api/printer/supplies${query}`);
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
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async getJobs(token: string) {
    const res = await fetch(`${API_BASE}/api/jobs`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // Receipt
  async getReceipt(jobId: string, token: string) {
    const res = await fetch(`${API_BASE}/api/jobs/${jobId}/receipt`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // User print stats
  async getJobStats(token: string) {
    const res = await fetch(`${API_BASE}/api/jobs/stats`, {
      headers: { Authorization: `Bearer ${token}` },
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
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async adminGetJobs(token: string, params?: { status?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const res = await fetch(`${API_BASE}/api/admin/jobs?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
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
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    return res.json();
  },

  async adminGetAnalytics(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/analytics`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch analytics');
    return res.json();
  },

  async adminGetPolicies(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/policies`, {
      headers: { Authorization: `Bearer ${token}` },
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
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // Announcements (public)
  async getActiveAnnouncement() {
    const res = await fetch(`${API_BASE}/api/announcements`);
    return res.json();
  },

  // Announcements (admin)
  async adminGetAnnouncements(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/announcements`, {
      headers: { Authorization: `Bearer ${token}` },
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
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // Wallet
  async getWallet(token: string) {
    const res = await fetch(`${API_BASE}/api/wallet`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
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
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async adminGetDailyLimit(token: string) {
    const res = await fetch(`${API_BASE}/api/admin/settings/daily-limit`, {
      headers: { Authorization: `Bearer ${token}` },
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
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async adminRevokeExemption(id: number, token: string) {
    const res = await fetch(`${API_BASE}/api/admin/exemptions/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  // CSV Export
  async downloadCSV(url: string, token: string, filename: string) {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  },
};
