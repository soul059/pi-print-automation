import { getMailTransporter } from './email';
import { env } from '../config/env';
import { logger } from '../config/logger';

export async function notifyJobCompleted(
  email: string,
  jobData: { jobId: string; fileName: string; printMode: string }
): Promise<void> {
  const collectMsg =
    jobData.printMode === 'later'
      ? 'Your printout is ready for collection.'
      : 'Your printout has been printed.';

  await sendNotification(
    email,
    'Print Job Completed ✅',
    `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #16a34a;">Print Job Completed ✅</h2>
      <p>${collectMsg}</p>
      <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 5px 0;"><strong>File:</strong> ${escapeHtml(jobData.fileName)}</p>
        <p style="margin: 5px 0;"><strong>Job ID:</strong> ${jobData.jobId}</p>
        <p style="margin: 5px 0;"><strong>Mode:</strong> ${jobData.printMode === 'later' ? 'Collect Later' : 'Print Now'}</p>
      </div>
      ${jobData.printMode === 'later' ? '<p style="color: #ca8a04; font-weight: bold;">📦 Please collect your printout at your convenience.</p>' : ''}
    </div>
  `
  );
}

export async function notifyJobFailed(
  email: string,
  jobData: { jobId: string; fileName: string; error?: string; refunded?: boolean }
): Promise<void> {
  const refundMsg = jobData.refunded
    ? '<p style="color: #16a34a;">💰 Your payment has been refunded automatically.</p>'
    : '<p style="color: #6b7280;">We are processing a refund for your payment.</p>';

  await sendNotification(
    email,
    'Print Job Failed ❌',
    `
    <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc2626;">Print Job Failed ❌</h2>
      <p>We're sorry, your print job could not be completed.</p>
      <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 15px 0;">
        <p style="margin: 5px 0;"><strong>File:</strong> ${escapeHtml(jobData.fileName)}</p>
        <p style="margin: 5px 0;"><strong>Job ID:</strong> ${jobData.jobId}</p>
        ${jobData.error ? `<p style="margin: 5px 0;"><strong>Reason:</strong> ${escapeHtml(jobData.error)}</p>` : ''}
      </div>
      ${refundMsg}
    </div>
  `
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendNotification(to: string, subject: string, html: string): Promise<void> {
  try {
    const transporter = getMailTransporter();

    await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: `Print Service - ${subject}`,
      html,
    });
    logger.info({ to, subject }, 'Notification email sent');
  } catch (err: any) {
    // Don't throw — notifications are best-effort
    logger.error({ to, subject, err: err.message }, 'Failed to send notification email');
  }
}
