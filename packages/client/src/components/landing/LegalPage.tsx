import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import TheArchitectLogo from './TheArchitectLogo';


const LEGAL_CONTENT: Record<string, { title: string; content: string }> = {
  privacy: {
    title: 'Privacy Policy',
    content: `Last updated: April 2026

1. Data Controller
TheArchitect is operated by Matthias Ganzmann. For questions regarding data protection, contact: privacy@thearchitect.site

2. Data We Collect
- Account data: email address, name, and role (when you register)
- Architecture files: uploaded for analysis (CSV, Excel, XML, JSON)
- Usage data: pages visited, features used, session duration
- Technical data: IP address, browser type, device information

3. How We Use Your Data
- To provide and improve the TheArchitect platform
- To perform AI-powered architecture health checks
- To authenticate your account and manage sessions
- To send service-related notifications (no marketing emails without consent)

4. Data Storage & Security
- All data is stored on servers located in the European Union
- Passwords are hashed using bcrypt with salt rounds
- API keys are hashed with SHA-256 (raw key shown only once)
- Sessions are stored in Redis with automatic expiration
- File uploads are processed in memory and not retained after analysis unless explicitly saved

5. Third-Party Services
- OAuth providers (Google, GitHub, Microsoft) — for authentication only
- No data is sold or shared with advertisers

6. Your Rights (GDPR)
You have the right to access, rectify, delete, or export your personal data. Contact us at privacy@thearchitect.site to exercise these rights.

7. Cookies
We use essential cookies only (session management). No tracking or advertising cookies.

8. Changes
We may update this policy. Changes will be posted on this page with an updated date.`,
  },
  terms: {
    title: 'Terms of Service',
    content: `Last updated: April 2026

1. Acceptance
By using TheArchitect, you agree to these terms. If you do not agree, do not use the service.

2. Service Description
TheArchitect is an enterprise architecture management platform providing 3D visualization, AI-powered analysis, compliance checking, and transformation roadmap generation.

3. Accounts
- You must provide accurate information when registering
- You are responsible for maintaining the security of your account
- You must not share your credentials with others

4. Acceptable Use
You agree not to:
- Upload malicious files or attempt to exploit the platform
- Use the service to process data you do not have rights to
- Reverse engineer, decompile, or attempt to extract source code
- Exceed reasonable usage limits or attempt to disrupt the service

5. Intellectual Property
- Your architecture data remains yours. We claim no ownership
- The TheArchitect platform, including its design, code, and AI models, is our intellectual property
- Generated reports and analysis results may be freely used by you

6. Availability
We strive for high availability but do not guarantee uninterrupted service. Scheduled maintenance will be communicated in advance when possible.

7. Limitation of Liability
TheArchitect is provided "as is". We are not liable for decisions made based on AI-generated analysis. Architecture health scores and recommendations are advisory, not prescriptive.

8. Termination
Either party may terminate the agreement at any time. Upon termination, your data will be deleted within 30 days unless you request an export.

9. Governing Law
These terms are governed by the laws of the Federal Republic of Germany. Jurisdiction is Munich, Germany.`,
  },
  imprint: {
    title: 'Imprint (Impressum)',
    content: `Information according to § 5 TMG (German Telemedia Act)

Matthias Ganzmann
Enterprise Architecture & Software Development

Contact:
Email: contact@thearchitect.site

Responsible for content according to § 55 Abs. 2 RStV:
Matthias Ganzmann

Dispute Resolution:
The European Commission provides a platform for online dispute resolution (OS): https://ec.europa.eu/consumers/odr
We are not willing or obliged to participate in dispute resolution proceedings before a consumer arbitration board.

Liability for Content:
As a service provider, we are responsible for our own content on these pages according to § 7 Abs.1 TMG. According to §§ 8 to 10 TMG, however, we are not obligated to monitor transmitted or stored third-party information or to investigate circumstances that indicate illegal activity.

Liability for Links:
Our offer contains links to external websites of third parties, on whose contents we have no influence. Therefore we cannot assume any liability for these external contents. The respective provider or operator of the pages is always responsible for the contents of the linked pages.`,
  },
};

export default function LegalPage() {
  const location = useLocation();
  const page = location.pathname.slice(1); // '/privacy' → 'privacy'
  const legal = LEGAL_CONTENT[page || ''];

  if (!legal) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-400 mb-4">Page not found</p>
          <Link to="/" className="text-[#00ff41] hover:text-[#00ff41]/80">Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back</span>
          </Link>
          <div className="w-px h-5 bg-white/10" />
          <Link to="/" className="flex items-center gap-2">
            <TheArchitectLogo size={24} />
            <span className="text-sm font-medium text-slate-300">TheArchitect</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-white mb-8">{legal.title}</h1>
        <div className="prose prose-invert prose-sm max-w-none">
          {legal.content.split('\n\n').map((paragraph, i) => {
            if (/^\d+\./.test(paragraph.trim())) {
              const [heading, ...rest] = paragraph.split('\n');
              return (
                <div key={i} className="mb-6">
                  <h2 className="text-lg font-semibold text-white mb-2">{heading}</h2>
                  {rest.map((line, j) => (
                    <p key={j} className="text-slate-400 text-sm leading-relaxed mb-1">
                      {line.startsWith('- ') ? (
                        <span className="flex gap-2"><span className="text-[#00ff41]">•</span>{line.slice(2)}</span>
                      ) : line}
                    </p>
                  ))}
                </div>
              );
            }
            return <p key={i} className="text-slate-400 text-sm leading-relaxed mb-4">{paragraph}</p>;
          })}
        </div>
      </main>

      <footer className="border-t border-white/5 py-6 px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between text-xs text-slate-500">
          <span>&copy; {new Date().getFullYear()} TheArchitect</span>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className={`hover:text-slate-300 transition-colors ${page === 'privacy' ? 'text-[#00ff41]' : ''}`}>Privacy</Link>
            <Link to="/terms" className={`hover:text-slate-300 transition-colors ${page === 'terms' ? 'text-[#00ff41]' : ''}`}>Terms</Link>
            <Link to="/imprint" className={`hover:text-slate-300 transition-colors ${page === 'imprint' ? 'text-[#00ff41]' : ''}`}>Imprint</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
