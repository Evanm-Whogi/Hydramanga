import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: 'Community Guidelines',
  description: 'Community rules and etiquette for reading, chatting, reviewing, and participating on HydraManga.',
  path: '/community-guidelines',
});

export default function CommunityGuidelinesPage() {
    return (
        <>
            <PageHeader title="Community Guidelines" description="Learn how to participate in the community." />

            <div className="container mx-auto text-primary flex flex-col py-10 min-h-[65vh] overflow-hidden">
                <h2 className="text-2xl font-semibold mt-6 mb-4">The Core Rules</h2>
                <ul className="list-disc list-inside space-y-3">
                    <li><span className="font-bold">Respect Your Fellow Readers:</span> Harassment, hate speech, bullying, and personal attacks will not be tolerated. Attack the plot hole, not the poster.</li>
                    <li><span className="font-bold">Tag Your Spoilers:</span> Don&apos;t ruin the experience for the First Bites and newcomers! If you are discussing major plot points, character deaths, or ending details in reviews or the general board, use appropriate spoiler warnings or tags.</li>
                    <li><span className="font-bold">Keep NSFW Contained:</span> We offer an NSFW toggle for the catalog, but public profiles (avatars, usernames, and bios) and the global chat must remain Safe For Work. Keep spicy discussions strictly within the comment sections of NSFW-tagged series.</li>
                    <li><span className="font-bold">No Spam or Self-Promotion:</span> Do not flood the chat, comment sections, or boards with repetitive messages, irrelevant links, or unauthorized advertising for other sites and discords.</li>
                    <li><span className="font-bold">Quality Reviews Only:</span> Reviews are limited to one per user per series. Make them count! Avoid troll reviews, spamming emojis as a review, or reviewing a 100-chapter series after reading only half a page.</li>
                    <li><span className="font-bold">No Malicious Content:</span> Sharing links to malware, phishing sites, or engaging in illegal activities will result in an immediate, permanent ban.</li>
                </ul>

                <h2 className="text-2xl font-semibold mt-6 mb-4">Chat &amp; Board Etiquette</h2>
                <ul className="list-disc list-inside space-y-3">
                    <li><span className="font-bold">Read the Room:</span> The real-time chat moves fast. Keep conversations inclusive and avoid aggressively dominating the chat box.</li>
                    <li><span className="font-bold">Use Stickers Wisely:</span> We love our sticker system, but please don&apos;t spam them to the point of breaking the chat flow.</li>
                    <li><span className="font-bold">Debate, Don&apos;t Destroy:</span> Board posts are meant for deeper discussions, tier lists, and theories. Disagreements are fine, but keep debates constructive. Toxic downvote bombing or reporting posts simply because you disagree with an opinion is not allowed.</li>
                </ul>

                <h2 className="text-2xl font-semibold mt-6 mb-4">Moderation &amp; Enforcement</h2>
                <p>Our Hydra Staff (Moderators and Admins) are here to keep the community thriving. They have the final say on rule violations.</p>
                <ul className="list-disc list-inside space-y-3 mt-4">
                    <li><span className="font-bold">Warnings &amp; Mutes:</span> Minor infractions (like accidental spoilers or mild spam) will result in a warning or a temporary chat/board mute.</li>
                    <li><span className="font-bold">Content Removal:</span> Staff will delete comments, reviews, or board posts that violate the guidelines. You will lose any Karma or progress associated with that removed content.</li>
                    <li><span className="font-bold">Suspensions &amp; Bans:</span> Repeated offenses, severe harassment, or malicious behavior will result in a suspension (earning you the Severed Head badge). Attempting to bypass a ban using alternate accounts will lead to a permanent IP ban and auto sign-out from all devices.</li>
                </ul>
                <p className="mt-4">
                    If you see someone breaking these rules, please use the report function rather than engaging with them directly. Many heads, one community — let&apos;s keep {process.env.NEXT_PUBLIC_NAME} a great place to read!
                </p>
            </div>
        </>
    );
}
