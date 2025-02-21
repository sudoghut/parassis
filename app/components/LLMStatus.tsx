import React, { useEffect, useState, useRef } from 'react';

export interface LLMStatusProps {
  status: string;
  error?: string;
  isLoading?: boolean;
}

export const LLMStatus: React.FC<LLMStatusProps> = ({ 
  status, 
  error,
  isLoading = false 
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (status || error || isLoading) {
      setIsVisible(true);
      // Clear any existing timeout
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 2000);
    }

    // Cleanup timeout on unmount or when dependencies change
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [status, error, isLoading]);

  if (!isVisible) return null;

  return (
    <div 
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 p-4 bg-gray-800 text-white rounded-lg shadow-lg"
    >
      <div className="flex items-center">
        {isLoading && (
          <div className="mr-2">
            <span className="animate-pulse">Processing...</span>
          </div>
        )}
        {status && <div className="mr-2">{status}</div>}
        {error && (
          <div className="text-red-400" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
