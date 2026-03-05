import { useLocation } from 'react-router-dom';

export default function UnderDevelopmentPage() {
    const location = useLocation();
    const pathParts = location.pathname.split('/');
    const version = pathParts[1] || 'This';

    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center">
            <div className="text-center animate-fade-in">
                {/* Construction icon */}
                <div className="mb-6">
                    <svg
                        className="w-24 h-24 mx-auto text-amber-500 animate-bounce"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                    </svg>
                </div>

                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                    Under Development
                </h1>

                <p className="text-lg text-gray-600 dark:text-gray-400 mb-2">
                    {version} is currently being developed
                </p>

                <p className="text-sm text-gray-500 dark:text-gray-500">
                    We're working hard to bring you this feature. Stay tuned!
                </p>

                {/* Progress indicator */}
                <div className="mt-8 w-64 mx-auto">
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full animate-pulse"
                            style={{ width: '60%' }}
                        />
                    </div>
                    <p className="mt-2 text-xs text-gray-400">Coming soon...</p>
                </div>
            </div>
        </div>
    );
}
