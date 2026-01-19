import type { Metadata } from "next";
import RegisterContent from "./components/RegisterContent";

export const metadata: Metadata = {
  title: `Sign Up - ${process.env.NEXT_PUBLIC_NAME}`,
  description: "Create a new account to start reading manga.",
  openGraph: {
    title: `Sign Up - ${process.env.NEXT_PUBLIC_NAME}`,
    description: "Join thousands of manga readers",
    type: "website",
  },
};

export default function RegisterPage() {
  return <RegisterContent />;
}
