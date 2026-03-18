import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSettingsStore } from '../../stores/settingsStore';
import { Key, Trash2, Copy, Check } from 'lucide-react';
import ConfirmationModal from './ConfirmationModal';

export default function ApiKeysSection() {
  const { apiKeys, fetchApiKeys, createApiKey, revokeApiKey } = useSettingsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      const key = await createApiKey({
        name: name.trim(),
        expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
      });
      setNewKey(key);
      setName('');
      setExpiresInDays('');
      setShowCreate(false);
      toast.success('API key created');
    } catch {
      toast.error('Failed to create API key');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold text-white mb-1">API Keys</h2>
      <p className="text-sm text-[#4a5a4a] mb-6">Create and manage personal access tokens for API access.</p>

      {/* New key display */}
      {newKey && (
        <div className="mb-6 rounded-lg border border-green-600/50 bg-green-900/20 p-4">
          <p className="text-sm text-green-400 font-medium mb-2">Your new API key (copy it now — it won't be shown again):</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-[#0a0a0a] px-3 py-2 text-sm text-white font-mono break-all">{newKey}</code>
            <button onClick={handleCopy} className="text-[#7a8a7a] hover:text-white transition p-2">
              {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
            </button>
          </div>
          <button onClick={() => setNewKey('')} className="mt-2 text-xs text-[#4a5a4a] hover:text-[#7a8a7a]">
            Dismiss
          </button>
        </div>
      )}

      {/* Create button */}
      <button
        onClick={() => setShowCreate(!showCreate)}
        className="mb-6 rounded-md bg-[#00ff41] px-4 py-2 text-sm font-medium text-black hover:bg-[#00cc33] transition"
      >
        Generate New Token
      </button>

      {/* Create form */}
      {showCreate && (
        <div className="mb-6 rounded-lg border border-[#1a2a1a] bg-[#111111] p-5 space-y-3 max-w-md">
          <div>
            <label className="block text-sm text-[#7a8a7a] mb-1">Token Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. CI/CD Pipeline"
              className="w-full rounded-md border border-[#1a2a1a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#4a5a4a] outline-none focus:border-[#00ff41]"
            />
          </div>
          <div>
            <label className="block text-sm text-[#7a8a7a] mb-1">Expiration (days, leave empty for no expiry)</label>
            <input
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value ? parseInt(e.target.value) : '')}
              placeholder="30"
              min={1}
              className="w-full rounded-md border border-[#1a2a1a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#4a5a4a] outline-none focus:border-[#00ff41]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="rounded-md bg-[#00ff41] px-4 py-2 text-sm font-medium text-black hover:bg-[#00cc33] transition disabled:opacity-50"
            >
              Create Token
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded-md border border-[#1a2a1a] px-4 py-2 text-sm text-[#7a8a7a] hover:text-white transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* API Keys list */}
      <div className="space-y-3">
        {apiKeys.length === 0 ? (
          <p className="text-sm text-[#4a5a4a]">No API keys yet.</p>
        ) : (
          apiKeys.map((key) => (
            <div key={key.id} className="flex items-center justify-between rounded-lg border border-[#1a2a1a] bg-[#111111] px-4 py-3">
              <div className="flex items-center gap-3">
                <Key size={16} className="text-[#00ff41]" />
                <div>
                  <p className="text-sm text-white font-medium">{key.name}</p>
                  <p className="text-xs text-[#4a5a4a]">
                    {key.prefix}... — Created {new Date(key.createdAt).toLocaleDateString()}
                    {key.expiresAt && ` — Expires ${new Date(key.expiresAt).toLocaleDateString()}`}
                    {key.lastUsedAt && ` — Last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDeleteKeyId(key.id)}
                className="text-[#7a8a7a] hover:text-red-400 transition"
                title="Revoke key"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>

      {deleteKeyId && (
        <ConfirmationModal
          title="Revoke API Key"
          message="This API key will be permanently revoked. Any applications using it will lose access."
          confirmLabel="Revoke Key"
          danger
          onConfirm={async () => {
            try {
              await revokeApiKey(deleteKeyId);
              toast.success('API key revoked');
            } catch {
              toast.error('Failed to revoke API key');
            }
            setDeleteKeyId(null);
          }}
          onClose={() => setDeleteKeyId(null)}
        />
      )}
    </div>
  );
}
