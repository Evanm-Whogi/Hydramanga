import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description: 'Learn how HydraManga collects, uses, and protects your personal information.',
  path: '/privacy',
});

export default function PrivacyPage() {
    return (
        <> 
            <PageHeader title="Privacy Policy" description="Learn how we handle your personal information." />

            <div className="container mx-auto text-primary flex flex-col py-10 min-h-[65vh] overflow-hidden">
                <p>Welcome to {process.env.NEXT_PUBLIC_NAME}! We are committed to protecting your privacy and ensuring a safe online experience. This Privacy Policy outlines how we collect, use, and protect your information when you visit our website.</p>

                <h2 className="text-2xl font-semibold mt-6 mb-4">Information We Collect</h2>
                    <p>When you visit our website, the only personal information we collect is your email address. This may be collected when you register on our site or fill out a form. We collect email addresses solely for logging purposes.</p>
                
                <h2 className="text-2xl font-semibold mt-6 mb-4">How We Use Your Information</h2>
                    <p>The email address you provide is used exclusively for logging purposes. We do not use your email address to send out emails or for any other purposes.</p>
               
                <h2 className="text-2xl font-semibold mt-6 mb-4">How We Protect Your Information</h2>
                    <p>We implement a variety of security measures to maintain the safety of your email address. These measures include:</p>
                    <ul className="list-disc list-inside">
                        <li><span className="font-bold">Secure Socket Layer (SSL) Technology:</span> We use SSL technology to encrypt sensitive information.</li>
                        <li><span className="font-bold">Regular Security Audits:</span> We conduct regular security audits to ensure the safety of our data.</li>
                    </ul>
                
                <h2 className="text-2xl font-semibold mt-6 mb-4">Cookies</h2>
                    <p>Our website uses cookies to enhance your experience. Cookies are small files that a site or its service provider transfers to your computer's hard drive through your web browser (if you allow) that enable the site's systems to recognize your browser and capture and remember certain information.</p>
               
                <h2 className="text-2xl font-semibold mt-6 mb-4">Third-Party Disclosure</h2>
                    <p>We do not sell, trade, or otherwise transfer to outside parties your email address. This does not include trusted third parties who assist us in operating our website, conducting our business, or servicing you, so long as those parties agree to keep this information confidential.</p>
               
                <h2 className="text-2xl font-semibold mt-6 mb-4">Third-Party Links</h2>
                    <p>Occasionally, at our discretion, we may include or offer third-party products or services on our website. These third-party sites have separate and independent privacy policies. We, therefore, have no responsibility or liability for the content and activities of these linked sites.</p>
               
                <h2 className="text-2xl font-semibold mt-6 mb-4">Your Consent</h2>
                    <p>By using our site, you consent to our website's privacy policy.</p>
               
                <h2 className="text-2xl font-semibold mt-6 mb-4">Changes to Our Privacy Policy</h2>
                    <p>If we decide to change our privacy policy, we will post those changes on this page. This policy was last modified on August 1st, 2024.</p>
               
                <h2 className="text-2xl font-semibold mt-6 mb-4">Contact Us</h2>
                <p>
                   If you have any questions regarding this privacy policy, please contact us at: <Link href={`/contact`} className="text-accent underline">{process.env.NEXT_PUBLIC_NAME}</Link>.
                </p>    
            </div>
        </>
    );
}