import type { Metadata } from "next";
import ResetPasswordContent from "./components/ResetPasswordContent";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Reset Password',
  description: 'Set a new password for your HydraManga account.',
  path: '/reset-password',
  noIndex: true,
});

export default function ResetPasswordPage() {
  return <ResetPasswordContent />;
}
