import type { Metadata } from "next";
import LoginContent from "./components/LoginContent";

export const metadata: Metadata = {
  title: `Login - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Login to your account to start reading manga.",
  openGraph: {
    title: `Login - ${process.env.NEXT_PUBLIC_NAME}`,
    description: "Access your manga reading lists and preferences",
    type: "website",
  },
};

export default function LoginPage() {
  return <LoginContent />;
}
