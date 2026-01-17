export default function Custom404() {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-primary">
            <h1 className="text-6xl font-bold mb-4">404</h1>
            <p className="text-2xl mb-8">Oops! The page you're looking for doesn't exist.</p>
            <a href="/" className="px-4 py-2 bg-accent text-background rounded-md hover:bg-accent-dark transition">
                Go Back Home
            </a>
        </div>
    );

}