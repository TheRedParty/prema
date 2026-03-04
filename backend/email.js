const { Resend } = require('resend');


async function sendVerificationEmail(email, username, token) {
    const resend = new Resend(process.env.RESEND_API_KEY);
  const verifyUrl = `http://localhost:3000/api/auth/verify/${token}`;

  await resend.emails.send({
    from: 'noreply@carino.red',
    to: email,
    subject: 'Verify your Cariño account',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Welcome to Cariño, ${username}</h2>
        <p>Thanks for signing up. Click the link below to verify your email address and activate your account.</p>
        <a href="${verifyUrl}" style="display: inline-block; background: #BB0000; color: white; padding: 12px 24px; text-decoration: none; margin: 16px 0;">
          Verify my account →
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 24 hours. If you didn't sign up for Cariño, you can ignore this email.</p>
      </div>
    `
  });
}

async function sendPasswordResetEmail(email, username, token) {
    const resend = new Resend(process.env.RESEND_API_KEY);
  const resetUrl = `http://localhost:3000/api/auth/reset-password/${token}`;

  await resend.emails.send({
    from: 'noreply@carino.red',
    to: email,
    subject: 'Reset your Cariño password',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Password Reset</h2>
        <p>Hi ${username}, we received a request to reset your Cariño password.</p>
        <a href="${resetUrl}" style="display: inline-block; background: #BB0000; color: white; padding: 12px 24px; text-decoration: none; margin: 16px 0;">
          Reset my password →
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request a password reset, you can ignore this email.</p>
      </div>
    `
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };