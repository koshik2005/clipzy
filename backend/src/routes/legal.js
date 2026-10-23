import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - ${esc(config.APP_NAME)}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#1a1a1a}h1{font-size:1.8rem}h2{margin-top:2rem;font-size:1.2rem}</style></head>
<body><h1>${esc(title)}</h1>${body}<p style="margin-top:3rem;color:#666;font-size:.85rem">Last updated: ${new Date().toISOString().slice(0, 10)}</p></body></html>`;

const who = `${esc(config.COMPANY_NAME)} ("we", "us")`;
const mail = `<a href="mailto:${esc(config.SUPPORT_EMAIL)}">${esc(config.SUPPORT_EMAIL)}</a>`;

// TEMPLATE TEXT. Have a lawyer review and adapt it to your jurisdiction and data practices before launch.
router.get('/privacy', (_req, res) =>
  res.type('html').send(
    page(
      'Privacy Policy',
      `<p>${who} operate the ${esc(config.APP_NAME)} app. This policy explains what we collect and why.</p>
<h2>Information we collect</h2>
<ul><li><b>Account data:</b> email address, username, display name, bio, profile photo, and a hashed password (or your Google account identifier if you sign in with Google).</li>
<li><b>Content you create:</b> videos, captions, comments, likes, follows and blocks.</li>
<li><b>Technical data:</b> IP address and basic request logs, used for security and abuse prevention.</li></ul>
<h2>How we use it</h2><p>To run the service, show content to other users, keep the platform safe, respond to reports, and meet legal obligations.</p>
<h2>Sharing</h2><p>Your public videos, comments and profile are visible to other users. We use infrastructure providers (hosting, database, file storage) to operate the service. We do not sell personal data.</p>
<h2>Retention and deletion</h2><p>You can delete your account in the app (Profile &gt; Settings &gt; Delete account). This removes your videos, profile data and sign-in credentials. See <a href="/delete-account">account deletion</a>.</p>
<h2>Children</h2><p>${esc(config.APP_NAME)} is not intended for children under 13 (or the minimum age in your country). Contact us to remove an underage account.</p>
<h2>Contact</h2><p>${mail}</p>`,
    ),
  ),
);

router.get('/terms', (_req, res) =>
  res.type('html').send(
    page(
      'Terms of Service',
      `<p>By using ${esc(config.APP_NAME)} you agree to these terms with ${who}.</p>
<h2>Your content</h2><p>You own what you post and grant us a license to host and display it in the service. You must have the rights to anything you upload.</p>
<h2>Rules</h2><p>No illegal content, sexual content involving minors, harassment, hate, graphic violence, spam, or impersonation. We remove content that breaks these rules and may suspend accounts. There is zero tolerance for objectionable content.</p>
<h2>Reporting and blocking</h2><p>You can report any video, comment or user and block users in the app. We review reports and act on violations.</p>
<h2>Disclaimer</h2><p>The service is provided "as is" without warranties, to the extent permitted by law.</p>
<h2>Contact</h2><p>${mail}</p>`,
    ),
  ),
);

router.get('/support', (_req, res) =>
  res.type('html').send(page('Support', `<p>Questions, bug reports or content concerns? Email ${mail}.</p>`)),
);

router.get('/delete-account', (_req, res) =>
  res.type('html').send(
    page(
      'Delete your account',
      `<p>To delete your account and data, open the app, go to <b>Profile &gt; Settings &gt; Delete account</b>.</p>
<p>If you can't access the app, email ${mail} from your account email address and we will delete it.</p>
<p>Deleting removes your videos, comments, follows, profile details and sign-in credentials.</p>`,
    ),
  ),
);

export default router;
