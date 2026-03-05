import React from 'react';

interface PageHeaderProps {
    title?: string;
    description?: string;
    actions?: React.ReactNode;
    className?: string;
}

export default function PageHeader({ title, description, actions, className = '' }: PageHeaderProps) {
    const hasTitle = typeof title === 'string' && title.trim().length > 0;

    return (
        <div className={`flex items-center justify-between mb-6 ${className}`}>
            <div>
                {hasTitle && <h1 className="text-2xl font-bold text-gray-900 mb-1">{title}</h1>}
                {description && <p className="text-gray-600 text-sm">{description}</p>}
            </div>
            {actions && (
                <div className="flex items-center gap-3">
                    {actions}
                </div>
            )}
        </div>
    );
}
