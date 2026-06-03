"use client";

import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Loader2, Save } from 'lucide-react';
import { getAdminSiteSettings, patchAdminSiteSettings, type AdminSiteSettings } from '@/services/siteSettingsService';
import { DEFAULT_MAINTENANCE_MESSAGE, DEFAULT_WELCOME_MODAL_BODY, DEFAULT_WELCOME_MODAL_DESCRIPTION, DEFAULT_WELCOME_MODAL_TITLE } from '@/lib/defaultWelcomeModal';

function SettingsToggle({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium text-primary">{label}</p>
        <p className="text-sm text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-foreground'}`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${checked ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export default function SettingsAdminClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState('');
  const [importRequestsEnabled, setImportRequestsEnabled] = useState(true);
  const [oauthGoogleEnabled, setOauthGoogleEnabled] = useState(true);
  const [oauthDiscordEnabled, setOauthDiscordEnabled] = useState(true);
  const [welcomeModalEnabled, setWelcomeModalEnabled] = useState(true);
  const [welcomeModalTitle, setWelcomeModalTitle] = useState('');
  const [welcomeModalDescription, setWelcomeModalDescription] = useState('');
  const [welcomeModalBody, setWelcomeModalBody] = useState('');
  const [initial, setInitial] = useState<AdminSiteSettings | null>(null);

  const applySettings = (settings: AdminSiteSettings) => {
    setRegistrationEnabled(settings.registrationEnabled);
    setMaintenanceMode(settings.maintenanceMode);
    setMaintenanceMessage(settings.maintenanceMessage ?? '');
    setImportRequestsEnabled(settings.importRequestsEnabled);
    setOauthGoogleEnabled(settings.oauthGoogleEnabled);
    setOauthDiscordEnabled(settings.oauthDiscordEnabled);
    setWelcomeModalEnabled(settings.welcomeModalEnabled);
    setWelcomeModalTitle(settings.welcomeModalTitle ?? '');
    setWelcomeModalDescription(settings.welcomeModalDescription ?? '');
    setWelcomeModalBody(settings.welcomeModalBody ?? '');
    setInitial(settings);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getAdminSiteSettings();
        if (cancelled) return;
        applySettings(settings);
      } catch {
        if (!cancelled) toast.error('Failed to load site settings');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    if (saving || !initial) return;
    setSaving(true);
    try {
      const settings = await patchAdminSiteSettings({
        registrationEnabled,
        maintenanceMode,
        maintenanceMessage: maintenanceMessage.trim() || null,
        importRequestsEnabled,
        oauthGoogleEnabled,
        oauthDiscordEnabled,
        welcomeModalEnabled,
        welcomeModalTitle: welcomeModalTitle.trim() || null,
        welcomeModalDescription: welcomeModalDescription.trim() || null,
        welcomeModalBody: welcomeModalBody.trim() || null,
      });
      applySettings(settings);
      toast.success('Site settings saved');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const norm = (value: string) => value.trim();
  const dirty =
    initial !== null &&
    (registrationEnabled !== initial.registrationEnabled ||
      maintenanceMode !== initial.maintenanceMode ||
      norm(maintenanceMessage) !== (initial.maintenanceMessage ?? '').trim() ||
      importRequestsEnabled !== initial.importRequestsEnabled ||
      oauthGoogleEnabled !== initial.oauthGoogleEnabled ||
      oauthDiscordEnabled !== initial.oauthDiscordEnabled ||
      welcomeModalEnabled !== initial.welcomeModalEnabled ||
      norm(welcomeModalTitle) !== (initial.welcomeModalTitle ?? '').trim() ||
      norm(welcomeModalDescription) !== (initial.welcomeModalDescription ?? '').trim() ||
      norm(welcomeModalBody) !== (initial.welcomeModalBody ?? '').trim());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted">
        <Loader2 className="size-6 animate-spin mr-2" />
        Loading settings…
      </div>
    );
  }

  const cardClass = 'bg-foreground/50 rounded-lg p-6 border border-borders/30 space-y-4';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-4">
        <div className={`${cardClass} space-y-4 w-1/2`}>
          <h2 className="text-lg font-semibold text-primary">Maintenance mode</h2>
          <p className="text-sm text-muted">When on, only administrators can use the site. Login stays available so admins can sign in.</p>
          <SettingsToggle
            label="Maintenance mode"
            description="Non-admins see a maintenance notice instead of the site."
            checked={maintenanceMode}
            disabled={saving}
            onChange={setMaintenanceMode}
          />
          <div>
            <label className="text-sm font-medium text-primary">Maintenance message</label>
            <p className="text-sm text-muted mb-2">Shown to non-admins during maintenance. Leave empty for the default message.</p>
            <textarea
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={DEFAULT_MAINTENANCE_MESSAGE}
              className="w-full rounded-lg border border-borders bg-background px-4 py-3 text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-y"
            />
          </div>
        </div>

        <div className={`${cardClass} space-y-6 w-1/2`}>
          <div>
            <h2 className="text-lg font-semibold text-primary">Registration &amp; OAuth</h2>
            <p className="text-sm text-muted mt-1">Control sign-up and social login on the login and register pages.</p>
          </div>
            <SettingsToggle
              label="Allow registration"
              description="When off, the sign-up form and OAuth on the register page are disabled. Existing users can still sign in."
              checked={registrationEnabled}
              disabled={saving}
              onChange={setRegistrationEnabled}
            />
            <div className="border-t border-borders/30 pt-6 space-y-6">
              <p className="text-sm text-muted">OAuth providers can be disabled individually. Env credentials must still be configured.</p>
              <div className="flex gap-4 justify-between">
                <div className="w-1/2 bg-background rounded-md p-3">
                  <SettingsToggle
                    label="Google"
                    description="Allow Continue with Google on login and register."
                    checked={oauthGoogleEnabled}
                    disabled={saving}
                    onChange={setOauthGoogleEnabled}
                  />
                </div>
                <div className="w-1/2 bg-background rounded-md p-3 ">
                  <SettingsToggle
                    label="Discord"
                    description="Allow Continue with Discord on login and register."
                    checked={oauthDiscordEnabled}
                    disabled={saving}
                    onChange={setOauthDiscordEnabled}
                  />
                </div>
              </div>
            </div>
        </div>
      </div>

      <div className={cardClass}>
        <h2 className="text-lg font-semibold text-primary">Import requests</h2>
        <p className="text-sm text-muted">Pause or resume user submissions on the request page.</p>
        <SettingsToggle
          label="Accept import requests"
          description="When off, users cannot submit new import requests on /request. Past requests remain visible."
          checked={importRequestsEnabled}
          disabled={saving}
          onChange={setImportRequestsEnabled}
        />
      </div>

      <div className={cardClass}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-primary">Welcome modal</h2>
            <p className="text-sm text-muted">First-visit popup (reappears after 24 hours once dismissed).</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={welcomeModalEnabled}
            disabled={saving}
            onClick={() => setWelcomeModalEnabled(!welcomeModalEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 ${welcomeModalEnabled ? 'bg-accent' : 'bg-foreground'}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${welcomeModalEnabled ? 'translate-x-5' : 'translate-x-1'}`} />
          </button>
        </div>
        <div className={welcomeModalEnabled ? 'space-y-4' : 'space-y-4 opacity-50 pointer-events-none'}>
          <div className="flex flex-row gap-4">
            <div className="w-full">
              <label className="text-sm font-medium text-primary">Title</label>
              <p className="text-xs text-muted mb-1">Leave empty for default: {DEFAULT_WELCOME_MODAL_TITLE}</p>
              <input
                type="text"
                value={welcomeModalTitle}
                onChange={(e) => setWelcomeModalTitle(e.target.value)}
                maxLength={200}
                placeholder={DEFAULT_WELCOME_MODAL_TITLE}
                className="w-full rounded-lg border border-borders bg-background px-4 py-2.5 text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div className="w-full">
              <label className="text-sm font-medium text-primary">Subtitle</label>
              <p className="text-xs text-muted mb-1">Leave empty for site description from env.</p>
              <textarea
                value={welcomeModalDescription}
                onChange={(e) => setWelcomeModalDescription(e.target.value)}
                rows={1}
                maxLength={500}
                placeholder={DEFAULT_WELCOME_MODAL_DESCRIPTION}
                className="w-full rounded-lg border border-borders bg-background px-4 py-2.5 text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-y"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-primary">Body (Markdown)</label>
            <p className="text-xs text-muted mb-1">Main info box. Leave empty for built-in default bullets. Supports markdown links.</p>
            <textarea
              value={welcomeModalBody}
              onChange={(e) => setWelcomeModalBody(e.target.value)}
              rows={10}
              maxLength={8000}
              placeholder={DEFAULT_WELCOME_MODAL_BODY.slice(0, 120) + '…'}
              className="w-full rounded-lg border border-borders bg-background px-4 py-3 text-primary placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent resize-y min-h-[180px] font-mono text-sm"
            />
            <p className="text-xs text-muted text-right mt-1">{welcomeModalBody.length}/8000</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !dirty}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed w-fit"
      >
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
