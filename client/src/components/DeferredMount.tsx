'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function DeferredMount({ children, rootMargin = '500px', placeholderClassName = 'min-h-64' }: { children: ReactNode; rootMargin?: string; placeholderClassName?: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisible(true);
                    obs.disconnect();
                }
            },
            { rootMargin },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [rootMargin]);

    return <div ref={ref}>{visible ? children : <div className={placeholderClassName} aria-hidden />}</div>;
}
