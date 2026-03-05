import { useState, useRef } from 'react';
import { post } from '../services/api';
import toast from 'react-hot-toast';

interface ImageUploadButtonProps {
    conversationId: string;
    onImageUploaded: (url: string) => void;
    disabled?: boolean;
}

export default function ImageUploadButton({
    conversationId,
    onImageUploaded,
    disabled = false
}: ImageUploadButtonProps) {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            toast.error('Please select an image file');
            return;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('Image must be less than 5MB');
            return;
        }

        // Show preview
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setPreview(base64);
        };
        reader.readAsDataURL(file);
    };

    const handleUpload = async () => {
        if (!preview) return;

        setUploading(true);
        try {
            const response = await post<{ success: boolean; data: { url: string; path: string } }>('/api/upload-image', {
                conversation_id: conversationId,
                base64_image: preview,
                filename: Date.now() + '.jpg'
            });

            if (response.success && response.data) {
                onImageUploaded(response.data.url);
                toast.success('Image uploaded');
                setPreview(null);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            }
        } catch (error) {
            console.error('Upload failed:', error);
            toast.error('Failed to upload image');
        } finally {
            setUploading(false);
        }
    };

    const cancelPreview = () => {
        setPreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
                disabled={disabled || uploading}
            />

            {preview ? (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 max-w-md w-full space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Preview Image</h3>
                            <button
                                onClick={cancelPreview}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                disabled={uploading}
                            >
                                <i className="bi bi-x-lg"></i>
                            </button>
                        </div>

                        <div className="relative rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                            <img
                                src={preview}
                                alt="Preview"
                                className="w-full h-auto max-h-96 object-contain"
                            />
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={cancelPreview}
                                className="btn-secondary flex-1"
                                disabled={uploading}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpload}
                                className="btn-primary flex-1 flex items-center justify-center gap-2"
                                disabled={uploading}
                            >
                                {uploading ? (
                                    <>
                                        <i className="bi bi-arrow-repeat animate-spin"></i>
                                        Uploading...
                                    </>
                                ) : (
                                    <>
                                        <i className="bi bi-cloud-upload"></i>
                                        Upload
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={disabled}
                    className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Attach image"
                >
                    <i className="bi bi-paperclip text-lg"></i>
                </button>
            )}
        </>
    );
}
