import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';

interface VersionLayoutProps {
    versionName: string;
}

export default function VersionLayout({ versionName }: VersionLayoutProps) {
    const location = useLocation();
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Trigger animation on route change
        setIsVisible(false);
        const timer = setTimeout(() => setIsVisible(true), 50);
        return () => clearTimeout(timer);
    }, [location.pathname]);

    return (
        <div
            className={`
        transition-all duration-500 ease-in-out
        ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
        >
            {/* Version Header */}
            <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {versionName}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {versionName} Dashboard
                </p>
            </div>

            {/* Page Content */}
            <div className="animate-fade-in">
                <Outlet />
            </div>
        </div>
    );
}
