import ImportStatus from '@/components/ImportStatus';

export default  function Footer() {
   return (
        <footer className="border-t-2 border-borders z-50 bg-background">
            <div className="container mx-auto">
                <div className="flex flex-col md:flex-row place-content-between pt-24 pb-12 space-y-6 md:space-y-0">
                    {/* About */}
                    <div className="flex flex-col w-full md:w-1/4 space-y-4 text-muted">
                        <h1 className="text-3xl text-primary">{process.env.NEXT_PUBLIC_NAME}</h1>
                        <p>{process.env.NEXT_PUBLIC_DESC}</p>
                    </div>
                    {/* Quick Links */}
                    <div className="flex flex-col w-full md:w-1/6 space-y-4 text-muted">
                        <h1 className="text-2xl text-primary">Browse</h1>
                        <a href="/" className="hover:text-primary">Popular</a>
                        <a href="/apply" className="hover:text-primary">Latest</a>
                        <a href="/cloud" className="hover:text-primary">Completed</a>
                        <a href="/webhosting" className="hover:text-primary">All Manga</a>
                    </div>
                    {/* Staff Links */}
                    <div className="flex flex-col w-full md:w-2/6 space-y-4 text-muted">
                        <h1 className="text-2xl text-primary">Genres</h1>
                        <div className="grid grid-cols-4 space-y-2">
                            <a href="#" className="hover:text-primary">Action</a>
                            <a href="#" className="hover:text-primary">Adventure</a>
                        </div>

                    </div>
                </div>
                <div className="flex flex-col text-primary">
                    <hr className="border border-borders w-full" />
                    <div className="flex py-5 items-center">
                        <span className="flex flex-col md:flex-row gap-2">© 2026 {process.env.NEXT_PUBLIC_NAME}, LLC. All rights reserved. | <p className="font-bold">Made by <a href="https://chit.sh/" className="text-accent font-bold underline">Whogi</a></p>
                        </span>
                        <ImportStatus />
                    </div>
                </div>
            </div>
        </footer>
    );
}