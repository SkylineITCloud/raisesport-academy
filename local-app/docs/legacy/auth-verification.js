/**
 * Email-verified signup/login for the RaiseSport backend (Node/Express + MySQL + JWT).
 *
 * Rules enforced here:
 *  - Signup creates an UNVERIFIED account and emails a 6-digit code (valid 10 min).
 *  - Login is refused until the email is verified (a fresh code is sent automatically).
 *  - Codes are stored hashed, compared in constant time, and locked after 5 wrong tries.
 *  - Resend has a 60-second cooldown. Passwords are checked before verification status is revealed.
 *
 * Mount BEFORE (or instead of) your existing /api/auth routes:
 *   app.use('/api/auth', require('./auth-verification')({ db: pool }));
 *
 * Install:  npm i nodemailer bcryptjs jsonwebtoken
 *           (use `bcrypt` instead of `bcryptjs` if that's what your current login uses, so old passwords still match)
 *
 * .env
 *   JWT_SECRET=...                      (already have this; also keys the code hashing)
 *   SMTP_HOST=smtp.yourprovider.com
 *   SMTP_PORT=587
 *   SMTP_USER=...
 *   SMTP_PASS=...
 *   MAIL_FROM="RaiseSport <no-reply@yourdomain.co.za>"
 *
 * Without SMTP_HOST the code is printed to the server console, in development only.
 * Run verification.sql first. Keep the JWT payload below in step with what your other routes expect.
 */
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const CODE_MINUTES = 10;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

module.exports = function authRouter({ db }) {
  const router = express.Router();
  router.use(express.json());

  const hashCode = (email, code) =>
    crypto.createHmac('sha256', process.env.JWT_SECRET).update(email + ':' + code).digest('hex');

  const transport = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      })
    : null;

  async function sendCode(user, code) {
    if (!transport) {
      if (process.env.NODE_ENV === 'production') throw new Error('SMTP is not configured');
      return console.log(`[DEV] Verification code for ${user.email}: ${code}`);
    }
    await transport.sendMail({
      from: process.env.MAIL_FROM,
      to: user.email,
      subject: 'Your RaiseSport verification code',
      text: `Hi ${user.name},\n\nYour RaiseSport verification code is ${code}.\nIt expires in ${CODE_MINUTES} minutes.\n\nIf you didn't create an account, you can ignore this email.`,
      html: `<p>Hi ${String(user.name).replace(/[<>&]/g, '')},</p><p>Your RaiseSport verification code is:</p>
             <p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p>
             <p>It expires in ${CODE_MINUTES} minutes. If you didn't create an account, you can ignore this email.</p>`
    });
  }

  // seconds the user must still wait before another code may be sent
  async function waitLeft(userId) {
    const [r] = await db.query(
      'SELECT GREATEST(0, ? - TIMESTAMPDIFF(SECOND, last_sent_at, NOW())) AS w FROM email_verifications WHERE user_id = ?',
      [RESEND_SECONDS, userId]
    );
    return r[0] ? Number(r[0].w) : 0;
  }

  async function issueCode(user) {
    const code = String(crypto.randomInt(100000, 1000000));
    await db.query(
      `INSERT INTO email_verifications (user_id, code_hash, expires_at, attempts, last_sent_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ${CODE_MINUTES} MINUTE), 0, NOW())
       ON DUPLICATE KEY UPDATE code_hash = VALUES(code_hash), expires_at = VALUES(expires_at), attempts = 0, last_sent_at = NOW()`,
      [user.id, hashCode(user.email, code)]
    );
    await sendCode(user, code);
  }

  const findUser = async email => (await db.query('SELECT * FROM users WHERE email = ?', [email]))[0][0];
  const clean = v => String(v || '').trim();

  /* ---- Sign up: create unverified account, email a code ---- */
  router.post('/signup', async (req, res) => {
    try {
      const name = clean(req.body.name), email = clean(req.body.email).toLowerCase(), password = String(req.body.password || '');
      if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
      if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

      const hash = await bcrypt.hash(password, 12);
      let user = await findUser(email);
      if (user && user.email_verified) return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });

      if (user) {
        // unverified leftover: let the real owner re-register with fresh details
        await db.query('UPDATE users SET name = ?, password_hash = ? WHERE id = ?', [name, hash, user.id]);
        user = { ...user, name };
      } else {
        const [ins] = await db.query('INSERT INTO users (name, email, password_hash, email_verified) VALUES (?, ?, ?, 0)', [name, email, hash]);
        user = { id: ins.insertId, name, email };
      }
      const wait = await waitLeft(user.id);
      if (wait === 0) await issueCode(user);
      res.status(201).json({ needsVerification: true, email, resendIn: wait || RESEND_SECONDS });
    } catch (err) {
      console.error('signup', err);
      res.status(500).json({ error: "We couldn't send the verification email. Please try again." });
    }
  });

  /* ---- Verify the code ---- */
  router.post('/verify', async (req, res) => {
    try {
      const email = clean(req.body.email).toLowerCase(), code = clean(req.body.code);
      const bad = () => res.status(400).json({ error: 'Invalid or expired code. Request a new one if needed.' });
      if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code from your email.' });

      const user = await findUser(email);
      if (!user) return bad();
      if (user.email_verified) return res.json({ verified: true });

      const [rows] = await db.query('SELECT code_hash, attempts, (expires_at > NOW()) AS valid FROM email_verifications WHERE user_id = ?', [user.id]);
      const v = rows[0];
      if (!v || !v.valid) return bad();
      if (v.attempts >= MAX_ATTEMPTS) return res.status(429).json({ error: 'Too many wrong attempts. Please request a new code.' });

      const given = Buffer.from(hashCode(email, code), 'hex'), stored = Buffer.from(v.code_hash, 'hex');
      if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) {
        await db.query('UPDATE email_verifications SET attempts = attempts + 1 WHERE user_id = ?', [user.id]);
        const left = MAX_ATTEMPTS - v.attempts - 1;
        return res.status(400).json({ error: left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Please request a new code.' });
      }
      await db.query('UPDATE users SET email_verified = 1 WHERE id = ?', [user.id]);
      await db.query('DELETE FROM email_verifications WHERE user_id = ?', [user.id]);
      res.json({ verified: true });
    } catch (err) {
      console.error('verify', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  /* ---- Resend (same reply whether or not the email exists, so accounts can't be probed) ---- */
  router.post('/resend', async (req, res) => {
    try {
      const email = clean(req.body.email).toLowerCase();
      const user = EMAIL_RE.test(email) ? await findUser(email) : null;
      if (user && !user.email_verified) {
        const wait = await waitLeft(user.id);
        if (wait > 0) return res.status(429).json({ error: `Please wait ${wait}s before requesting another code.`, resendIn: wait });
        await issueCode(user);
      }
      res.json({ ok: true, resendIn: RESEND_SECONDS });
    } catch (err) {
      console.error('resend', err);
      res.status(500).json({ error: "We couldn't send the email. Please try again." });
    }
  });

  /* ---- Login: only verified accounts get a token ---- */
  router.post('/login', async (req, res) => {
    try {
      const email = clean(req.body.email).toLowerCase(), password = String(req.body.password || '');
      const user = await findUser(email);
      if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });

      if (!user.email_verified) {
        const wait = await waitLeft(user.id);
        if (wait === 0) await issueCode(user);
        return res.status(403).json({
          error: 'Please verify your email to log in. We sent you a code.',
          needsVerification: true, email, resendIn: wait || RESEND_SECONDS
        });
      }
      const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, name: user.name });
    } catch (err) {
      console.error('login', err);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return router;
};
