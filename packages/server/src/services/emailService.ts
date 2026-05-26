import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT ?? '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendInvitationEmail(opts: {
  to: string;
  tournamentName: string;
  token: string;
  baseUrl: string;
  senderEmail?: string;
  senderName?: string;
}): Promise<void> {
  const joinUrl = `${opts.baseUrl}/join?token=${opts.token}`;
  const senderLabel = opts.senderName || opts.senderEmail || 'The OPT organizer';

  await transporter.sendMail({
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    replyTo: opts.senderEmail || undefined,
    to: opts.to,
    subject: `You're invited to play in ${opts.tournamentName}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#111;color:#fff;padding:32px;border-radius:12px;">
        <h1 style="font-size:22px;margin:0 0 8px;">♠ OPT</h1>
        <p style="color:#aaa;font-size:13px;margin:0 0 24px;">Olalde Poker Tournament</p>
        <h2 style="font-size:18px;margin:0 0 12px;">You're invited!</h2>
        <p style="color:#ccc;line-height:1.6;"><strong style="color:#fff;">${senderLabel}</strong> has invited you to play in <strong style="color:#fff;">${opts.tournamentName}</strong>.</p>
        <p style="color:#ccc;line-height:1.6;">Click the button below to create your account and confirm your seat.</p>
        <a href="${joinUrl}" style="display:inline-block;margin-top:24px;padding:12px 28px;background:#2a5cff;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;">
          Accept Invitation
        </a>
        <p style="margin-top:28px;color:#555;font-size:12px;">Or paste this link: ${joinUrl}</p>
        ${opts.senderEmail ? `<p style="margin-top:8px;color:#555;font-size:12px;">Reply to this email to contact ${senderLabel} directly.</p>` : ''}
      </div>
    `,
  });
}
