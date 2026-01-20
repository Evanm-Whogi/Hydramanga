import { TrendingUp, ArrowRight } from "lucide-react";

export default function SectionHeader({ title, subtitle, filters, link }: { title: string, subtitle?: string, filters?: any, link?: string }) {
    return (
        <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
                <h2 className="text-3xl font-bold text-white">{title} <span className="text-muted">{subtitle}</span></h2>
            </div>
            {filters && (
                <a href={`/discover?${filters}`} className="text-muted text-base hover:underline">View All <ArrowRight className="size-4 inline ml-1" /></a>
            )} 
            {link && (
                <a href={link} className="text-muted text-base hover:underline">View All <ArrowRight className="size-4 inline ml-1" /></a>
            )}
        </div>
    );
}