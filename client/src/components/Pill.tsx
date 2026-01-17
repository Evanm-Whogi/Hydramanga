// Pill Component

export default function Pill({ text, theme, size = "px-4 py-2" }: { text: string, theme?: string, size?: string }) {

    // Theme presets
    const themePresets: { [key: string]: string } = {
        default: "bg-accent/20 backdrop-blur-sm rounded-full items-center w-fit animate-glow border border-accent/40",
        foreground: "bg-foreground/20 backdrop-blur-sm rounded-full items-center w-fit animate-glow border border-foreground/40",
        background: "bg-background/20 backdrop-blur-sm rounded-full items-center w-fit animate-glow border border-background/40",
        successful: "bg-green-600/20 backdrop-blur-sm rounded-full items-center w-fit animate-glow border border-green-600/40",
        warning: "bg-yellow-600/20 backdrop-blur-sm rounded-full items-center w-fit animate-glow border border-yellow-600/40",
        danger: "bg-red-600/20 backdrop-blur-sm rounded-full items-center w-fit animate-glow border border-red-600/40",
    };

    const themeClass = theme ? (themePresets[theme] || themePresets.default) : themePresets.default;

    return (
        <span className={`flex ${themeClass} ${size}`}>
            {text}
        </span>
    );
}
