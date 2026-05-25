import type { Metadata } from "next";
import ResetPasswordContent from "./components/ResetPasswordContent";

export const metadata: Metadata = {
  title: `Reset Password - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Set a new password for your account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordContent />;
}
