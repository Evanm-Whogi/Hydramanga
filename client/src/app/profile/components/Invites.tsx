"use client";
import { useState, useEffect } from "react";
import { Copy, CheckCircle, Share2, Loader } from "lucide-react";
import { getUserInviteCodes, generateInviteCode } from "@/services/inviteService";
import { toast } from "react-toastify";

interface InviteCode {
  id: string;
  code: string;
  createdAt: Date;
  used: boolean;
  usedAt: Date | null;
  usedByUser: {
    id: string;
    name: string;
    image: string;
  } | null;
}

export default function Invites() {
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchCodes();
  }, []);

  const fetchCodes = async () => {
    try {
      setLoading(true);
      const result = await getUserInviteCodes();
      setCodes(result);
    } catch (error) {
      toast("Failed to load invite codes", { type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const generateNewCode = async () => {
    try {
      setGenerating(true);
      const newCode = await generateInviteCode();
      setCodes([newCode, ...codes]);
      toast("New invite code generated!", { type: "success" });
    } catch (error: any) {
      toast(error.message || "Failed to generate code", { type: "error" });
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(code);
    toast("Copied to clipboard!", { type: "success" });
    setTimeout(() => setCopied(null), 2000);
  };

  const shareCode = (code: string) => {
    const shareText = `${process.env.NEXT_PUBLIC_URL}\nJoin me on ${process.env.NEXT_PUBLIC_NAME}! Use my invite code: \`\`${code}\`\``;
    navigator.clipboard.writeText(shareText);
  };

  const unusedCount = codes.filter(c => !c.used).length;
  const usedCount = codes.filter(c => c.used).length;

  return (
    <div className="space-y-6 mb-5">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-primary">Invite Codes</h2>
          <p className="text-muted mt-1">Share these codes with friends to invite them to {process.env.NEXT_PUBLIC_NAME}</p>
        </div>
        <button
          onClick={generateNewCode}
          disabled={generating || unusedCount >= 5 || usedCount >= 5}
          className="flex hover:cursor-pointer items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          {generating ? <Loader className="size-4 animate-spin" /> : <Share2 className="size-4" />}
          Generate New Code
        </button>
      </div>

      <div className="bg-foreground rounded-lg p-4 border border-borders">
        <p className="text-sm text-muted">
          You have invited <span className="text-accent font-semibold">{usedCount}/5</span> people.
          You have <span className="text-accent font-semibold">{unusedCount}</span> active invite codes.
          {usedCount >= 5 && " You've reached your invite limit!"}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader className="size-6 animate-spin text-accent" />
        </div>
      ) : codes.length === 0 ? (
        <div className="text-center py-8 text-muted">
          <p>No invite codes yet. Click the button above to generate one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {codes.map(code => (
            <div
              key={code.id}
              className={`bg-foreground rounded-lg p-4 border ${code.used ? "border-borders opacity-60" : "border-borders"} transition-all`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-lg font-bold text-primary break-all">{code.code}</span>
                    {code.used && <CheckCircle className="size-5 text-green-500 shrink-0" />}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    Created {new Date(code.createdAt).toLocaleDateString()}
                  </div>
                  {code.used && code.usedByUser && (
                    <div className="text-xs text-muted mt-2 flex items-center gap-2">
                      <img src={code.usedByUser.image} alt={code.usedByUser.name} className="size-4 rounded-full" />
                      Used by <span className="font-semibold text-primary">{code.usedByUser.name}</span> on {new Date(code.usedAt!).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {!code.used && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => copyToClipboard(code.code)}
                      title="Copy to clipboard"
                      className="flex hover:cursor-pointer items-center gap-1 px-3 py-1.5 bg-background hover:bg-background/80 rounded text-muted hover:text-primary transition-colors text-sm">
                      {copied === code.code ? (<> <CheckCircle className="size-4" /> Copied </>) : (<> <Copy className="size-4" /> Copy </>)}
                    </button>
                    <button
                      onClick={() => shareCode(code.code)}
                      title="Share code"
                      className="flex hover:cursor-pointer items-center gap-1 px-3 py-1.5 bg-background hover:bg-background/80 rounded text-muted hover:text-primary transition-colors text-sm">
                      <Share2 className="size-4" /> Share
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {codes.some(c => c.used) && (
        <div className="mt-8 pt-6 border-t border-borders">
          <h3 className="text-lg font-semibold text-primary mb-3">Used Codes</h3>
          <div className="space-y-2">
            {codes
              .filter(c => c.used)
              .map(code => (
                <div key={code.id} className="bg-foreground/50 rounded p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-muted">{code.code}</span>
                    {code.usedByUser && (
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <img
                          src={code.usedByUser.image}
                          alt={code.usedByUser.name}
                          className="size-4 rounded-full"
                        />
                        {code.usedByUser.name}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
