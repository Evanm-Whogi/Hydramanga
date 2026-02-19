import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import SectionHeader from './SectionHeader';
import { useEffect } from 'react';

export default function CarouselSection({ title, children, controls, loading }: any) {
   const [emblaRef, emblaApi] = useEmblaCarousel({ 
        align: 'start', 
        dragFree: true,
        containScroll: 'trimSnaps'
    });

    // Reset scroll to start when children change
    useEffect(() => {
        if (emblaApi) emblaApi.scrollTo(0);
    }, [children, emblaApi]);
    
    return (
        <section className="relative group/carousel">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-4">
                <SectionHeader title={title} />
                {controls}
            </div>

            {/* Carousel Wrapper */}
            <div className="relative">
                <button onClick={() => emblaApi?.scrollPrev()}
                    className="absolute left-0 top-0 bottom-0 z-10 w-12 flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300">
                    <div className="p-2 rounded-full bg-foreground/90 text-white shadow-lg cursor-pointer hover:bg-accent ml-3">
                        <ChevronLeft size={24} />
                    </div>
                </button>

                {/* The Viewport */}
                <div className="overflow-hidden w-full px-1 min-w-0" ref={emblaRef}>
                    <div className={`flex gap-4 md:gap-6 ${loading ? 'opacity-50' : ''}`}>
                        {children}
                    </div>
                </div>

                {/* Right Button Overlay */}
                <button onClick={() => emblaApi?.scrollNext()}
                    className="absolute right-0 top-0 bottom-0 z-10 w-12 flex items-center justify-center opacity-0 group-hover/carousel:opacity-100 transition-opacity duration-300">
                    <div className="p-2 rounded-full bg-foreground/90 text-white shadow-lg cursor-pointer hover:bg-accent mr-3">
                        <ChevronRight size={24} />
                    </div>
                </button>
            </div>
        </section>
    );
};