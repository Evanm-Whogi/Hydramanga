export default function PageHeader({ title, description, notice }: { title: string; description: string; notice?: React.ReactNode }) {
    return (
        <section id="header" className="bg-foreground pt-25 pb-8 rounded-lg shadow-lg">
            <div className="container mx-auto">
                <div className="flex flex-col space-y-2">
                    <h1 className="text-5xl text-accent font-bold capitalize">{title}</h1>
                    <h2 className="text-2xl text-muted">{description}</h2>
                    {notice}
                </div>
            </div>
        </section>
    );
}
