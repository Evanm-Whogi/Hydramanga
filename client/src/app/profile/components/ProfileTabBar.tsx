"use client";

import type { ReactNode } from "react";

export type ProfileTabId = string;

export default function ProfileTabBar({ tabs, activeTab, onTabChange }: { tabs: { id: ProfileTabId; label: string; icon?: ReactNode }[]; activeTab: ProfileTabId; onTabChange: (tab: ProfileTabId) => void }) {
  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`${activeTab === tab.id ? "bg-foreground text-primary border border-borders shadow-md" : "bg-foreground text-muted"} hover:bg-foreground/50 px-4 py-2 rounded-lg inline-flex items-center text-base lg:text-lg cursor-pointer transition-colors`}
        >
          {tab.icon ? <span className="mr-2">{tab.icon}</span> : null}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
