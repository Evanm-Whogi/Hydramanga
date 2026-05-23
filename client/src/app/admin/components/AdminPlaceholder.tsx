interface AdminPlaceholderProps {
  title: string;
  description: string;
}

export default function AdminPlaceholder({ title, description }: AdminPlaceholderProps) {
  return (
    <div className="bg-foreground rounded-lg border border-borders p-8 text-center">
      <h2 className="text-xl font-semibold text-primary mb-2">{title}</h2>
      <p className="text-muted max-w-md mx-auto">{description}</p>
    </div>
  );
}
