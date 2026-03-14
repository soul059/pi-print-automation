const API_BASE = import.meta.env.VITE_API_URL || '';

function getHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export const api = {
  // Auth
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

  // Upload
  async uploadFile(file: File, config: Record<string, unknown>, token: string) {
    const formData = new FormData();
    formData.append('file', file);
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
};
