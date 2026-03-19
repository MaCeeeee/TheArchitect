import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Check, X, Mail, Shield } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { invitationAPI } from '../../services/api';

interface InvitationDetails {
  id: string;
  projectName: string;
  projectDescription: string;
  inviterName: string;
  inviterEmail: string;
  inviterAvatar: string;
  role: string;
  invitedEmail: string;
  expiresAt: string;
}

type PageState = 'loading' | 'details' | 'accepted' | 'declined' | 'error' | 'login_required';

export default function InvitationPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userEmail = useAuthStore((s) => s.user?.email);

  const [state, setState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [processing, setProcessing] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setErrorMsg('No invitation token provided');
      setState('error');
      return;
    }
    loadInvitation();
  }, [token]);

  const loadInvitation = async () => {
    try {
      const { data } = await invitationAPI.getByToken(token!);
      setInvitation(data);

      if (!isAuthenticated) {
        setState('login_required');
      } else {
        setState('details');
      }
    } catch (err: any) {
      const status = err.response?.status;
      const errData = err.response?.data;
      if (status === 410) {
        setErrorMsg(errData?.status === 'expired'
          ? 'This invitation has expired.'
          : 'This invitation is no longer valid.');
      } else if (status === 404) {
        setErrorMsg('Invitation not found.');
      } else {
        setErrorMsg('Failed to load invitation.');
      }
      setState('error');
    }
  };

  const handleAccept = async () => {
    setProcessing(true);
    try {
      const { data } = await invitationAPI.accept(token!);
      setProjectId(data.projectId);
      setState('accepted');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to accept invitation';
      setErrorMsg(msg);
      setState('error');
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async () => {
    setProcessing(true);
    try {
      await invitationAPI.decline(token!);
      setState('declined');
    } catch {
      setErrorMsg('Failed to decline invitation');
      setState('error');
    } finally {
      setProcessing(false);
    }
  };

  const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

  const ROLE_DESCRIPTIONS: Record<string, string> = {
    editor: 'Can edit elements, connections, and workspaces',
    reviewer: 'Can review and comment on architecture',
    viewer: 'Can view architecture in read-only mode',
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Loading */}
        {state === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-16">
            <Loader2 size={32} className="animate-spin text-[#00ff41]" />
            <p className="text-sm text-[#7a8a7a]">Loading invitation...</p>
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="rounded-xl border border-red-500/20 bg-[#111111] p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <X size={24} className="text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Invitation Error</h2>
            <p className="text-sm text-[#7a8a7a] mb-6">{errorMsg}</p>
            <button
              onClick={() => navigate('/')}
              className="rounded-md bg-[#1a2a1a] px-6 py-2.5 text-sm text-white hover:bg-[#2a3a2a] transition"
            >
              Go to Dashboard
            </button>
          </div>
        )}

        {/* Login required */}
        {state === 'login_required' && invitation && (
          <div className="rounded-xl border border-[#1a2a1a] bg-[#111111] p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#00ff41]/10 flex items-center justify-center">
              <Shield size={24} className="text-[#00ff41]" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Login Required</h2>
            <p className="text-sm text-[#7a8a7a] mb-2">
              <strong className="text-white">{invitation.inviterName}</strong> invited you to
            </p>
            <p className="text-base font-semibold text-[#00ff41] mb-4">{invitation.projectName}</p>
            <p className="text-xs text-[#4a5a4a] mb-6">
              Log in or create an account with <strong className="text-[#7a8a7a]">{invitation.invitedEmail}</strong> to accept this invitation.
            </p>
            <button
              onClick={() => navigate(`/login?redirect=/invitations/${token}`)}
              className="w-full rounded-md bg-[#00ff41] px-6 py-2.5 text-sm font-medium text-black hover:bg-[#00cc33] transition"
            >
              Log In to Accept
            </button>
          </div>
        )}

        {/* Invitation details */}
        {state === 'details' && invitation && (
          <div className="rounded-xl border border-[#1a2a1a] bg-[#111111] overflow-hidden">
            {/* Header */}
            <div className="bg-[#0a0a0a] border-b border-[#1a2a1a] p-6 text-center">
              <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-[#00ff41]/10 flex items-center justify-center">
                <Mail size={24} className="text-[#00ff41]" />
              </div>
              <h2 className="text-lg font-semibold text-white">Project Invitation</h2>
              <p className="text-xs text-[#4a5a4a] mt-1">
                from <strong className="text-[#7a8a7a]">{invitation.inviterName}</strong>
              </p>
            </div>

            {/* Project info */}
            <div className="p-6 space-y-4">
              <div className="rounded-lg bg-[#0a0a0a] border border-[#1a2a1a] p-4">
                <p className="text-base font-semibold text-white">{invitation.projectName}</p>
                {invitation.projectDescription && (
                  <p className="text-xs text-[#4a5a4a] mt-1">{invitation.projectDescription}</p>
                )}
              </div>

              <div className="rounded-lg bg-[#0a0a0a] border border-[#1a2a1a] p-4">
                <p className="text-xs text-[#4a5a4a] mb-1">Your role</p>
                <p className="text-sm font-semibold text-[#00ff41]">{roleLabel(invitation.role)}</p>
                <p className="text-xs text-[#4a5a4a] mt-1">
                  {ROLE_DESCRIPTIONS[invitation.role] || ''}
                </p>
              </div>

              {/* Email mismatch warning */}
              {userEmail && userEmail.toLowerCase() !== invitation.invitedEmail.toLowerCase() && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
                  <p className="text-xs text-amber-300">
                    This invitation was sent to <strong>{invitation.invitedEmail}</strong> but you're logged in as <strong>{userEmail}</strong>. You may need to log in with the invited email.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleDecline}
                  disabled={processing}
                  className="flex-1 flex items-center justify-center gap-2 rounded-md border border-[#1a2a1a] bg-[#0a0a0a] px-4 py-2.5 text-sm text-[#7a8a7a] hover:text-white hover:border-[#2a3a2a] transition disabled:opacity-50"
                >
                  {processing ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                  Decline
                </button>
                <button
                  onClick={handleAccept}
                  disabled={processing}
                  className="flex-1 flex items-center justify-center gap-2 rounded-md bg-[#00ff41] px-4 py-2.5 text-sm font-medium text-black hover:bg-[#00cc33] transition disabled:opacity-50"
                >
                  {processing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Accept
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Accepted */}
        {state === 'accepted' && (
          <div className="rounded-xl border border-[#00ff41]/20 bg-[#111111] p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#00ff41]/10 flex items-center justify-center">
              <Check size={24} className="text-[#00ff41]" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Invitation Accepted</h2>
            <p className="text-sm text-[#7a8a7a] mb-6">
              You're now a member of <strong className="text-white">{invitation?.projectName}</strong>
            </p>
            <button
              onClick={() => navigate(projectId ? `/project/${projectId}` : '/')}
              className="rounded-md bg-[#00ff41] px-6 py-2.5 text-sm font-medium text-black hover:bg-[#00cc33] transition"
            >
              Open Project
            </button>
          </div>
        )}

        {/* Declined */}
        {state === 'declined' && (
          <div className="rounded-xl border border-[#1a2a1a] bg-[#111111] p-8 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-[#1a2a1a] flex items-center justify-center">
              <X size={24} className="text-[#7a8a7a]" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">Invitation Declined</h2>
            <p className="text-sm text-[#7a8a7a] mb-6">
              You've declined the invitation to {invitation?.projectName}.
            </p>
            <button
              onClick={() => navigate('/')}
              className="rounded-md bg-[#1a2a1a] px-6 py-2.5 text-sm text-white hover:bg-[#2a3a2a] transition"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
